import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import {
  NTS_STATE,
  PopbillError,
  cancelIssue,
  getCorpInfo,
  getInvoiceInfo,
  getInvoiceInfos,
  getPartnerBalance,
  getPartnerChargeUrl,
  isPopbillConfigured,
  registIssue,
} from "@/lib/popbill/client";
import { isIssuedState } from "@/lib/installer/popbill-tax-invoice";
import { StatementError, formatYm, getHqInvoiceInfo } from "@/lib/installation/settlement/statements";

/**
 * 본사(백오피스) 쪽 팝빌 작업.
 * - 앱 발행 세금계산서 취소: 국세청 전송 전이면 발행취소, 전송 후면 음수 수정세금계산서(착오)로 없앤다.
 *   그 뒤 정산서를 반려 상태로 돌려 기사가 앱에서 다시 발행하게 한다.
 * - 국세청 전송 결과 동기화(매일 cron)
 * - 파트너 포인트 잔액·충전 URL
 */

export const POPBILL_UNIT_COST = 100;

type HistoryEntry = {
  type: "CANCEL" | "MODIFY";
  mgtKey: string;
  ntsConfirmNum: string;
  modifyMgtKey?: string;
  modifyNtsConfirmNum?: string | null;
  reason: string;
  adminId: string;
  at: string;
};

function newModifyMgtKey(ym: string, seq: number): string {
  return `AM${ym.replace("-", "")}-${seq}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * 앱에서 발행한 세금계산서를 본사가 취소하고 정산서를 「반려」로 돌린다(지급 전만).
 * 반환: 어떤 방식으로 없앴는지.
 */
export async function voidStatementInvoice(input: {
  statementId: string;
  adminId: string;
  reason: string;
}): Promise<{ method: "CANCEL" | "MODIFY" | "ALREADY_CANCELED" }> {
  const reason = input.reason.trim();
  if (!reason) throw new StatementError("REJECT_REASON_REQUIRED");
  const row = await prisma.settlementStatement.findUnique({
    where: { id: input.statementId },
    include: {
      installer: {
        select: {
          settlementInfo: { select: { businessName: true, representativeName: true, invoiceEmail: true } },
        },
      },
    },
  });
  if (!row) throw new StatementError("NOT_FOUND");
  if (row.paidAt) throw new StatementError("ALREADY_PAID");
  if (!row.ntsConfirmNum || !row.popbillMgtKey || !row.popbillCorpNum) throw new StatementError("NOT_APP_ISSUED");

  const corpNum = row.popbillCorpNum;
  const info = await getInvoiceInfo(corpNum, row.popbillMgtKey);
  if (!info) throw new StatementError("POPBILL_DOC_NOT_FOUND");

  const entry: HistoryEntry = {
    type: "CANCEL",
    mgtKey: row.popbillMgtKey,
    ntsConfirmNum: row.ntsConfirmNum,
    reason,
    adminId: input.adminId,
    at: new Date().toISOString(),
  };
  let method: "CANCEL" | "MODIFY" | "ALREADY_CANCELED";

  if (info.stateCode >= 600 && info.stateCode < 700) {
    method = "ALREADY_CANCELED";
  } else if (info.stateCode === NTS_STATE.SENT) {
    method = "MODIFY";
  } else if (isIssuedState(info.stateCode)) {
    method = "CANCEL";
  } else {
    throw new StatementError("POPBILL_STATE_UNSUPPORTED");
  }

  try {
    if (method === "CANCEL") {
      try {
        await cancelIssue(corpNum, row.popbillMgtKey, `본사 취소: ${reason}`);
      } catch (error) {
        // 확인과 취소 사이에 국세청 전송이 끝났을 수 있다 → 수정세금계산서로 넘어간다.
        const now = await getInvoiceInfo(corpNum, row.popbillMgtKey);
        if (now?.stateCode !== NTS_STATE.SENT) throw error;
        method = "MODIFY";
      }
    }
    if (method === "MODIFY") {
      const hq = await getHqInvoiceInfo();
      const s = row.installer.settlementInfo;
      if (!s || !hq.businessNumber || !hq.businessName || !hq.representative) throw new StatementError("HQ_INFO_MISSING");
      const corp = await getCorpInfo(corpNum).catch(() => null);
      const modifyMgtKey = newModifyMgtKey(row.ym, row.seq);
      const r = await registIssue({
        mgtKey: modifyMgtKey,
        writeDate: info.writeDate ?? "",
        supplier: {
          corpNum,
          corpName: s.businessName,
          ceoName: s.representativeName,
          addr: corp?.addr,
          bizType: corp?.bizType,
          bizClass: corp?.bizClass,
          email: s.invoiceEmail,
        },
        buyer: {
          corpNum: hq.businessNumber,
          corpName: hq.businessName,
          ceoName: hq.representative,
          addr: hq.address,
          bizType: hq.businessType,
          bizClass: hq.businessItem,
          email: hq.email,
        },
        itemName: `설치 용역 (${formatYm(row.ym)}${row.seq > 1 ? " 추가분" : ""}) 취소`,
        supplyCost: -info.supplyCostTotal,
        tax: -info.taxTotal,
        remark: `착오 정정: ${reason}`.slice(0, 150),
        allowLate: true,
        modify: { code: 1, orgNtsConfirmNum: row.ntsConfirmNum },
      });
      entry.type = "MODIFY";
      entry.modifyMgtKey = modifyMgtKey;
      entry.modifyNtsConfirmNum = r.ntsConfirmNum;
    }
  } catch (error) {
    if (error instanceof StatementError) throw error;
    const msg = error instanceof PopbillError ? `[${error.code}] ${error.message}` : String(error);
    console.error("[popbill/void]", row.id, msg);
    throw new StatementError(`POPBILL_FAILED:${msg}`.slice(0, 300));
  }

  const history = Array.isArray(row.popbillHistory) ? (row.popbillHistory as Prisma.JsonArray) : [];
  await prisma.settlementStatement.update({
    where: { id: row.id },
    data: {
      popbillHistory: [...history, entry] as unknown as Prisma.InputJsonValue,
      popbillMgtKey: null,
      popbillCorpNum: null,
      ntsConfirmNum: null,
      popbillIssuedAt: null,
      popbillError: null,
      ntsSendState: null,
      ntsSendError: null,
      ntsSentAt: null,
      ntsCheckedAt: null,
      invoiceIssueDate: null,
      evidenceStatus: "REJECTED",
      evidenceRejectReason: reason,
      evidenceReviewedAt: new Date(),
      evidenceReviewedBy: input.adminId,
    },
  });

  try {
    await sendAssignmentPushToInstaller(row.installerId, {
      title: `${formatYm(row.ym)} 세금계산서가 취소됐습니다`,
      body: `사유: ${reason}. 앱에서 다시 발행해 주세요.`,
    });
  } catch (error) {
    console.error("[popbill/void/push]", error);
  }
  return { method };
}

/**
 * 국세청 전송 결과 동기화. 발행한 지 1시간 넘었고 아직 전송 완료가 확인되지 않은 앱 발행 건을 팝빌에 묻는다.
 */
export async function syncNtsResults(now = new Date()): Promise<{ checked: number; sent: number; failed: number } | null> {
  if (!isPopbillConfigured()) return null;
  const rows = await prisma.settlementStatement.findMany({
    where: {
      ntsConfirmNum: { not: null },
      popbillMgtKey: { not: null },
      popbillIssuedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
      OR: [{ ntsSendState: null }, { ntsSendState: { in: ["SENDING", "FAILED"] } }],
    },
    select: { id: true, popbillMgtKey: true, popbillCorpNum: true },
    take: 2000,
  });
  const byCorp = new Map<string, Array<{ id: string; mgtKey: string }>>();
  for (const r of rows) {
    if (!r.popbillCorpNum || !r.popbillMgtKey) continue;
    const list = byCorp.get(r.popbillCorpNum) ?? [];
    list.push({ id: r.id, mgtKey: r.popbillMgtKey });
    byCorp.set(r.popbillCorpNum, list);
  }

  let checked = 0;
  let sent = 0;
  let failed = 0;
  for (const [corpNum, list] of byCorp) {
    let infos;
    try {
      infos = await getInvoiceInfos(corpNum, list.map((l) => l.mgtKey));
    } catch (error) {
      console.error("[popbill/nts-sync]", corpNum, error);
      continue;
    }
    const byKey = new Map(infos.map((i) => [i.mgtKey, i]));
    for (const l of list) {
      const info = byKey.get(l.mgtKey);
      // 없는 문서는 상태 코드가 비어서 온다.
      if (!info || typeof info.stateCode !== "number") continue;
      checked += 1;
      // 팝빌 사이트에서 직접 발행취소한 건(6xx)은 CANCELED 로 두고 더 묻지 않는다.
      const state =
        info.stateCode === NTS_STATE.SENT
          ? "SUCCESS"
          : info.stateCode === NTS_STATE.SEND_FAILED
            ? "FAILED"
            : info.stateCode >= 600 && info.stateCode < 700
              ? "CANCELED"
              : "SENDING";
      if (state === "SUCCESS") sent += 1;
      if (state === "FAILED") failed += 1;
      await prisma.settlementStatement.update({
        where: { id: l.id },
        data: {
          ntsSendState: state,
          ntsSendError: state === "FAILED" ? (info.ntsSendErrCode ?? "전송 실패") : null,
          ntsSentAt: state === "SUCCESS" ? parseDT(info.ntsResultDT ?? info.ntsSendDT) : null,
          ntsCheckedAt: now,
        },
      });
    }
  }
  return { checked, sent, failed };
}

function parseDT(v: string | null): Date | null {
  if (!v || !/^\d{14}$/.test(v)) return null;
  const d = new Date(
    `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}+09:00`,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 파트너 포인트 조회에 쓸 회원 사업자번호: 연동 완료 기사 아무나, 없으면 본사 */
async function anyMemberCorpNum(): Promise<string | null> {
  const link = await prisma.installerPopbillLink.findFirst({ where: { status: "READY" }, select: { corpNum: true } });
  if (link) return link.corpNum;
  const hq = await getHqInvoiceInfo();
  return hq.businessNumber?.replace(/\D/g, "") || null;
}

export type PopbillPointsSummary = { balance: number; unitCost: number; issuable: number };

/** 파트너 포인트 잔액. 팝빌 설정이 없거나 조회에 실패하면 null */
export async function getPopbillPointsSummary(): Promise<PopbillPointsSummary | null> {
  if (!isPopbillConfigured()) return null;
  try {
    const corpNum = await anyMemberCorpNum();
    if (!corpNum) return null;
    const balance = await getPartnerBalance(corpNum);
    return { balance, unitCost: POPBILL_UNIT_COST, issuable: Math.floor(balance / POPBILL_UNIT_COST) };
  } catch (error) {
    console.error("[popbill/points]", error);
    return null;
  }
}

/** 파트너 포인트 충전 팝업 URL(30초 유효) */
export async function getPopbillChargeUrl(): Promise<string> {
  const corpNum = await anyMemberCorpNum();
  if (!corpNum) throw new StatementError("POPBILL_NO_MEMBER");
  return getPartnerChargeUrl(corpNum);
}
