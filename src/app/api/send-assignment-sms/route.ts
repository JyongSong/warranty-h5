import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { SolapiMessageService } from "solapi";
import { requireAdminApi } from "@/lib/adminAuth";
import { findInstallerByBranch } from "@/lib/dispatch";
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
  error?: string;
};

function normalizeKr(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdminApi();
  if (errorResponse) return errorResponse;

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER;
  if (!apiKey || !apiSecret || !from) {
    return NextResponse.json(
      { error: "SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER env 누락" },
      { status: 500 }
    );
  }
  const service = new SolapiMessageService(apiKey, apiSecret);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    return NextResponse.json(
      { error: `시트 "${SHEET_NAME}" 를 찾을 수 없습니다 (dispatch export 파일을 사용하세요)` },
      { status: 400 }
    );
  }

  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
  const results: Result[] = [];

  // 템플릿은 한 번만 로드 (loop 안에서 N번 쿼리 방지)
  const templateBody = await getSmsTemplateBody(
    SMS_TEMPLATE_KEYS.ASSIGNMENT,
    DEFAULT_ASSIGNMENT_SMS_TEMPLATE
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
        error: `기사 연락처 미입력 (dispatch.ts 의 INSTALLERS 에서 phone 설정 필요)`,
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

    const text = renderTemplate(templateBody, {
      branchName: installer.branchName,
      installerPhone: installer.phone,
      branch,
      customerPhone: to,
    });

    try {
      await service.send({ to: normalized, from, text });
      results.push({ row: rowNumber, branch, to, ok: true });
    } catch (e) {
      results.push({
        row: rowNumber,
        branch,
        to,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    total: rows.length,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
