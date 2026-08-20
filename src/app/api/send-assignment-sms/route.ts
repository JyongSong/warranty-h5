import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { SolapiMessageService } from "solapi";
import { requireAdminApi } from "@/lib/adminAuth";
import {
  AssignmentSmsSecurityError,
  finishAssignmentSmsDispatch,
  getAssignmentSmsLimits,
  reserveAssignmentSmsDispatch,
  validateAssignmentSmsUpload,
} from "@/lib/backoffice/sms-dispatch-security";
import { findInstallerByBranch } from "@/lib/dispatch";
import {
  buildAlimtalkKakaoOptionsOrNull,
  isAlimtalkEnabled,
} from "@/lib/notifications/alimtalk-options";
import {
  DEFAULT_ASSIGNMENT_SMS_TEMPLATE,
  SMS_TEMPLATE_KEYS,
  getSmsTemplateBody,
  renderTemplate,
} from "@/lib/smsTemplate";

export const dynamic = "force-dynamic";

// dispatch export 의 시트명과 일치
const SHEET_NAME = "A S수리입력";

type Row = {
  지점명?: unknown;
  연락처?: unknown;
};

type Result = {
  row: number;
  branch: string;
  to: string;
  ok: boolean;
  /** 실제로 어느 채널로 시도했는지. ALIMTALK 이어도 카카오 실패 시 SMS 로 대체발송된다. */
  channel?: "ALIMTALK" | "SMS";
  error?: string;
};

type PreparedRow = {
  row: number;
  branch: string;
  to: string;
  normalized: string;
  text: string;
  branchName: string;
  installerPhone: string;
};

function normalizeKr(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

export async function POST(request: NextRequest) {
  const { admin, errorResponse } = await requireAdminApi(1);
  if (errorResponse) return errorResponse;

  try {
    const limits = await getAssignmentSmsLimits();
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const from = process.env.SOLAPI_SENDER;
    if (!apiKey || !apiSecret || !from) {
      return NextResponse.json(
        { error: "SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER env 누락" },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    validateAssignmentSmsUpload({ fileSize: file.size }, limits);

    const buffer = await file.arrayBuffer();
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "array" });
    } catch {
      return NextResponse.json({ error: "invalid Excel file" }, { status: 400 });
    }

    const ws = wb.Sheets[SHEET_NAME];
    if (!ws) {
      return NextResponse.json(
        { error: `시트 "${SHEET_NAME}" 를 찾을 수 없습니다 (dispatch export 파일을 사용하세요)` },
        { status: 400 },
      );
    }

    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
    validateAssignmentSmsUpload({ fileSize: file.size, rowCount: rows.length }, limits);

    const results: Result[] = [];
    const preparedRows: PreparedRow[] = [];
    const templateBody = await getSmsTemplateBody(
      SMS_TEMPLATE_KEYS.ASSIGNMENT,
      DEFAULT_ASSIGNMENT_SMS_TEMPLATE,
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const branch = String(row["지점명"] ?? "").trim();
      const to = String(row["연락처"] ?? "").trim();
      const rowNumber = i + 2;

      if (!branch || !to) {
        results.push({
          row: rowNumber,
          branch,
          to,
          ok: false,
          error: "필수 필드 누락 (지점명/연락처)",
        });
        continue;
      }

      const installer = findInstallerByBranch(branch);
      if (!installer) {
        results.push({
          row: rowNumber,
          branch,
          to,
          ok: false,
          error: `설치기사 등록 안됨 (지점명: "${branch}")`,
        });
        continue;
      }
      if (!installer.phone) {
        results.push({
          row: rowNumber,
          branch,
          to,
          ok: false,
          error: "기사 연락처 미입력 (dispatch.ts 의 INSTALLERS 에서 phone 설정 필요)",
        });
        continue;
      }

      const normalized = normalizeKr(to);
      if (!normalized) {
        results.push({
          row: rowNumber,
          branch,
          to,
          ok: false,
          error: "연락처 형식 오류",
        });
        continue;
      }

      preparedRows.push({
        row: rowNumber,
        branch,
        to,
        normalized,
        text: renderTemplate(templateBody, {
          branchName: installer.branchName,
          installerPhone: installer.phone,
          branch,
          customerPhone: to,
        }),
        branchName: installer.branchName,
        installerPhone: installer.phone,
      });
    }

    const reservation = await reserveAssignmentSmsDispatch({
      adminId: admin!.id,
      fileName: file.name,
      recipientCount: preparedRows.length,
      templateBody,
      templateKey: SMS_TEMPLATE_KEYS.ASSIGNMENT,
      maxRecipientsPerDay: limits.maxRecipientsPerDay,
    });
    const service = new SolapiMessageService(apiKey, apiSecret);
    // 게이트 판정은 수백 건을 도는 루프 밖에서 한 번만 한다.
    const alimtalkEnabled = await isAlimtalkEnabled();

    for (const row of preparedRows) {
      // 카카오 발송이 실패하면 disableSms:false 로 위의 text 가 SMS 대체발송된다.
      const kakaoOptions = alimtalkEnabled
        ? buildAlimtalkKakaoOptionsOrNull({
            templateKey: "assignment_completed",
            variables: { branchName: row.branchName, installerPhone: row.installerPhone },
          })
        : null;
      const channel = kakaoOptions ? "ALIMTALK" : "SMS";

      try {
        await service.send(
          kakaoOptions
            ? { to: row.normalized, from, text: row.text, kakaoOptions }
            : { to: row.normalized, from, text: row.text },
        );
        results.push({ row: row.row, branch: row.branch, to: row.to, ok: true, channel });
      } catch (error) {
        results.push({
          row: row.row,
          branch: row.branch,
          to: row.to,
          ok: false,
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const sentCount = results.filter((result) => result.ok).length;
    const failedCount = results.filter((result) => !result.ok).length;
    const attemptedFailedCount = preparedRows.length - sentCount;
    if (reservation) {
      await finishAssignmentSmsDispatch({
        auditKey: reservation.key,
        sentCount,
        failedCount: attemptedFailedCount,
      });
    }

    return NextResponse.json({
      total: rows.length,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    if (error instanceof AssignmentSmsSecurityError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[api/send-assignment-sms]", error);
    return NextResponse.json({ error: "SMS_SEND_FAILED" }, { status: 500 });
  }
}
