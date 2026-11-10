import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { SYSTEM_SETTING_KEYS, getSystemSettingValue, isSystemSettingEnabled } from "@/lib/backoffice/system-settings";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import {
  findMissingPhotos,
  getCompletionPhotoSignedUrls,
  statementEvidencePrefix,
} from "@/lib/installer/storage";
import type { TaxDocType } from "@/lib/installer/settlement-info-shared";

/**
 * 월 정산서. 기사 1명 × 1개월 1장.
 *
 * 본사가 지난달 정산서를 「발행」하면, 그 달 말일까지 완료된(승인된) 정산 라인 중 아직 어디에도
 * 묶이지 않은 것을 모두 그 달 정산 주기에 묶고(주기는 바로 SETTLED → 라인 금액 잠금),
 * 기사별로 정산서를 만든다. 지난달에 늦게 승인된 건도 다음 달 발행 때 같이 들어간다.
 *
 * 증빙 흐름(증빙 종류로 갈림):
 *   TAX  (전자·종이 세금계산서): 증빙 제출 → 본사 확인 → 지급.  지급액 = 공급가액 + 부가세(10%, 원 미만 절사)
 *   CASH (현금영수증):            지급 → 승인번호 제출 → 본사 확인. 지급액 = 정산 금액
 *                                 지급 후 영수증을 내지 않으면 기사 앱은 이 화면 말고는 막힌다.
 * 증빙 종류·부가세·지급액은 첫 진행(증빙 제출 또는 지급) 때 정산서에 고정한다.
 */

export type EvidenceFlow = "TAX" | "CASH";
export type EvidenceStatus = "PENDING" | "SUBMITTED" | "REJECTED" | "CONFIRMED";

export class StatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementError";
  }
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isValidYm(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export function currentYm(now = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 7);
}

export function shiftYm(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** 그 달 KST 1일 0시 ~ 다음 달 1일 0시(미포함)의 UTC 시각, 말일 문자열 */
export function ymBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
  const endExclusive = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start,
    endExclusive,
    firstDate: `${ym}-01`,
    lastDate: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function flowOf(taxDocType: string | null | undefined): EvidenceFlow | null {
  if (taxDocType === "E_TAX_INVOICE" || taxDocType === "PAPER_TAX_INVOICE") return "TAX";
  if (taxDocType === "CASH_RECEIPT") return "CASH";
  return null;
}

/** 세금계산서는 정산 금액을 공급가액으로 보고 부가세 10%(원 미만 절사)를 더해 지급한다. */
export function computeAmounts(baseAmount: number, flow: EvidenceFlow | null) {
  const vatAmount = flow === "TAX" ? Math.floor(baseAmount / 10) : 0;
  return { vatAmount, payAmount: baseAmount + vatAmount };
}

// ── 본사 발행 ─────────────────────────────────────────────────────────────

export type MonthPreviewRow = { installerId: string; installerName: string; lineCount: number; baseAmount: number };

/** 발행 전 미리보기: 이 달 말일까지 완료됐고 아직 묶이지 않은 라인을 기사별로 합산 */
export async function previewMonth(ym: string): Promise<MonthPreviewRow[]> {
  const { endExclusive } = ymBounds(ym);
  const groups = await prisma.settlementLine.groupBy({
    by: ["installerId"],
    where: { periodId: null, completedAt: { lt: endExclusive } },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  if (groups.length === 0) return [];
  const installers = await prisma.installer.findMany({
    where: { id: { in: groups.map((g) => g.installerId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(installers.map((i) => [i.id, i.name]));
  return groups
    .map((g) => ({
      installerId: g.installerId,
      installerName: nameById.get(g.installerId) ?? "-",
      lineCount: g._count._all,
      baseAmount: g._sum.totalAmount ?? 0,
    }))
    .sort((a, b) => b.baseAmount - a.baseAmount);
}

export async function isMonthIssued(ym: string): Promise<boolean> {
  return (await prisma.settlementStatement.count({ where: { ym } })) > 0;
}

/**
 * 선택한 기사들의 정산서를 발행한다. 같은 달에 여러 번 나눠 발행할 수 있다.
 * 선택하지 않은 기사의 라인은 묶이지 않고 남아, 나중에 이 달 또는 다음 달에 발행된다.
 * 이미 이 달 정산서가 있는 기사는 건너뛴다.
 */
export async function issueMonthStatements(input: {
  ym: string;
  adminId: string;
  installerIds: string[];
}): Promise<number> {
  const { ym, adminId } = input;
  const installerIds = [...new Set(input.installerIds)];
  if (!isValidYm(ym)) throw new StatementError("YM_INVALID");
  if (ym >= currentYm()) throw new StatementError("MONTH_NOT_CLOSED");
  if (installerIds.length === 0) throw new StatementError("NOTHING_SELECTED");
  // 공개 전에 발행하면 기사에게 푸시가 나가므로 막는다.
  if (!(await isSettlementLaunched())) throw new StatementError("NOT_LAUNCHED");
  const { endExclusive, firstDate, lastDate } = ymBounds(ym);
  const periodName = `${formatYm(ym)} 정산서`;

  const created = await prisma.$transaction(async (tx) => {
    const already = await tx.settlementStatement.findMany({
      where: { ym, installerId: { in: installerIds } },
      select: { installerId: true },
    });
    const alreadySet = new Set(already.map((a) => a.installerId));
    const targets = installerIds.filter((id) => !alreadySet.has(id));
    if (targets.length === 0) throw new StatementError("ALREADY_ISSUED");

    // 이 달 정산 주기는 하나만 둔다. 먼저 발행한 기사가 있으면 그 주기에 붙인다.
    const existing = await tx.settlementPeriod.findFirst({
      where: { name: periodName, status: "SETTLED" },
      select: { id: true },
    });
    const period =
      existing ??
      (await tx.settlementPeriod.create({
        data: {
          name: periodName,
          startDate: new Date(`${firstDate}T00:00:00.000Z`),
          endDate: new Date(`${lastDate}T00:00:00.000Z`),
          // 발행과 동시에 잠근다. 잠긴 주기의 라인은 승인 수정·취소로 금액이 바뀌지 않는다.
          status: "SETTLED",
          settledAt: new Date(),
          settledByAdminId: adminId,
          createdByAdminId: adminId,
        },
        select: { id: true },
      }));

    await tx.settlementLine.updateMany({
      where: { periodId: null, installerId: { in: targets }, completedAt: { lt: endExclusive } },
      data: { periodId: period.id },
    });

    const groups = await tx.settlementLine.groupBy({
      by: ["installerId"],
      where: { periodId: period.id, installerId: { in: targets } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    if (groups.length === 0) throw new StatementError("NOTHING_TO_ISSUE");

    await tx.settlementStatement.createMany({
      data: groups.map((g) => ({
        ym,
        periodId: period.id,
        installerId: g.installerId,
        lineCount: g._count._all,
        baseAmount: g._sum.totalAmount ?? 0,
        issuedByAdminId: adminId,
      })),
    });
    return groups.map((g) => g.installerId);
  });

  await Promise.all(
    created.map((installerId) =>
      notify(installerId, `${formatYm(ym)} 정산서가 도착했습니다`, "이력·정산 탭에서 금액을 확인하고 증빙을 진행해 주세요."),
    ),
  );
  return created.length;
}

/**
 * 정산서 한 장 발행 취소. 아무 진행도 없을 때(증빙 제출·지급 전)만 된다.
 * 그 기사의 라인은 다시 미발행으로 돌아가고, 그 달에 정산서가 하나도 안 남으면 주기도 지운다.
 */
export async function cancelStatement(statementId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const st = await tx.settlementStatement.findUnique({
      where: { id: statementId },
      select: { id: true, periodId: true, installerId: true, evidenceStatus: true, paidAt: true },
    });
    if (!st) throw new StatementError("NOT_FOUND");
    if (st.paidAt || st.evidenceStatus !== "PENDING") throw new StatementError("ALREADY_IN_PROGRESS");
    await tx.settlementStatement.delete({ where: { id: st.id } });
    await tx.settlementLine.updateMany({
      where: { periodId: st.periodId, installerId: st.installerId },
      data: { periodId: null },
    });
    if ((await tx.settlementStatement.count({ where: { periodId: st.periodId } })) === 0) {
      await tx.settlementPeriod.delete({ where: { id: st.periodId } });
    }
  });
}

// ── 조회 ─────────────────────────────────────────────────────────────────

export type StatementView = {
  id: string;
  ym: string;
  installerId: string;
  installerName: string;
  lineCount: number;
  baseAmount: number;
  /** 정산서에 고정된 값, 없으면 기사 정산 정보의 현재 값 */
  taxDocType: TaxDocType | null;
  flow: EvidenceFlow | null;
  vatAmount: number;
  payAmount: number;
  evidenceStatus: EvidenceStatus;
  evidencePhotoUrls: Array<string | null>;
  invoiceIssueDate: string | null;
  cashReceiptNo: string | null;
  cashReceiptDate: string | null;
  evidenceSubmittedAt: string | null;
  evidenceRejectReason: string | null;
  paidAt: string | null;
  /** 기사 정산 정보 상태: 없음이면 null */
  infoStatus: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
};

type StatementRow = Awaited<ReturnType<typeof loadStatements>>[number];

async function loadStatements(where: Prisma.SettlementStatementWhereInput) {
  return prisma.settlementStatement.findMany({
    where,
    orderBy: [{ ym: "desc" }, { baseAmount: "desc" }],
    include: {
      installer: {
        select: {
          name: true,
          settlementInfo: {
            select: {
              taxDocType: true,
              status: true,
              bankName: true,
              accountNumberEncrypted: true,
              accountHolder: true,
            },
          },
        },
      },
    },
  });
}

function tryDecrypt(value: string | null | undefined): string | null {
  try {
    return decryptNullablePii(value);
  } catch {
    return null;
  }
}

async function toView(row: StatementRow, withPhotos: boolean): Promise<StatementView> {
  const info = row.installer.settlementInfo;
  const taxDocType = (row.taxDocType ?? info?.taxDocType ?? null) as TaxDocType | null;
  const flow = flowOf(taxDocType);
  const computed = computeAmounts(row.baseAmount, flow);
  const photos = withPhotos ? await getCompletionPhotoSignedUrls(row.evidencePhotoPaths) : [];
  return {
    id: row.id,
    ym: row.ym,
    installerId: row.installerId,
    installerName: row.installer.name,
    lineCount: row.lineCount,
    baseAmount: row.baseAmount,
    taxDocType,
    flow,
    vatAmount: row.vatAmount ?? computed.vatAmount,
    payAmount: row.payAmount ?? computed.payAmount,
    evidenceStatus: row.evidenceStatus as EvidenceStatus,
    evidencePhotoUrls: photos.map((p) => p.url),
    invoiceIssueDate: row.invoiceIssueDate,
    cashReceiptNo: row.cashReceiptNo,
    cashReceiptDate: row.cashReceiptDate,
    evidenceSubmittedAt: row.evidenceSubmittedAt?.toISOString() ?? null,
    evidenceRejectReason: row.evidenceRejectReason,
    paidAt: row.paidAt?.toISOString() ?? null,
    infoStatus: info?.status ?? null,
    bankName: info?.bankName ?? null,
    accountNumber: info ? tryDecrypt(info.accountNumberEncrypted) : null,
    accountHolder: info?.accountHolder ?? null,
  };
}

export async function listMonthStatements(ym: string): Promise<StatementView[]> {
  const rows = await loadStatements({ ym });
  return Promise.all(rows.map((r) => toView(r, true)));
}

export async function getInstallerStatement(installerId: string, ym: string): Promise<StatementView | null> {
  const [row] = await loadStatements({ installerId, ym });
  return row ? toView(row, true) : null;
}

/** 현금영수증 건: 지급됐는데 영수증이 아직(또는 반려) → 앱을 막는다. 가장 오래된 달 하나 */
export async function getBlockingStatement(installerId: string): Promise<{ id: string; ym: string } | null> {
  const row = await prisma.settlementStatement.findFirst({
    where: {
      installerId,
      taxDocType: "CASH_RECEIPT",
      paidAt: { not: null },
      evidenceStatus: { in: ["PENDING", "REJECTED"] },
    },
    orderBy: { ym: "asc" },
    select: { id: true, ym: true },
  });
  return row;
}

export type HqInvoiceInfo = {
  businessNumber: string | null;
  businessName: string | null;
  representative: string | null;
  address: string | null;
  businessType: string | null;
  businessItem: string | null;
  email: string | null;
};

export async function getHqInvoiceInfo(): Promise<HqInvoiceInfo> {
  const k = SYSTEM_SETTING_KEYS;
  const [businessNumber, businessName, representative, address, businessType, businessItem, email] =
    await Promise.all(
      [k.hqBusinessNumber, k.hqBusinessName, k.hqRepresentative, k.hqAddress, k.hqBusinessType, k.hqBusinessItem, k.hqInvoiceEmail].map(
        (key) => getSystemSettingValue(key),
      ),
    );
  return { businessNumber, businessName, representative, address, businessType, businessItem, email };
}

// ── 기사 증빙 제출 ────────────────────────────────────────────────────────

async function loadOwnStatement(installerId: string, statementId: string) {
  const row = await prisma.settlementStatement.findUnique({
    where: { id: statementId },
    include: { installer: { select: { settlementInfo: { select: { taxDocType: true } } } } },
  });
  if (!row || row.installerId !== installerId) throw new StatementError("NOT_FOUND");
  const taxDocType = row.taxDocType ?? row.installer.settlementInfo?.taxDocType ?? null;
  return { row, taxDocType, flow: flowOf(taxDocType) };
}

function checkPhotoPaths(statementId: string, paths: string[], { min, max }: { min: number; max: number }) {
  if (paths.length < min || paths.length > max) throw new StatementError("PHOTO_COUNT_INVALID");
  const prefix = statementEvidencePrefix(statementId);
  for (const p of paths) if (!p.startsWith(prefix) || p.includes("..")) throw new StatementError("PHOTO_INVALID");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 세금계산서(전자·종이) 증빙 제출. 지급 전, 대기·반려 상태에서만. */
export async function submitTaxInvoiceEvidence(input: {
  installerId: string;
  statementId: string;
  photoPaths: string[];
  issueDate: string;
}): Promise<void> {
  const { row, taxDocType, flow } = await loadOwnStatement(input.installerId, input.statementId);
  if (flow !== "TAX") throw new StatementError("FLOW_MISMATCH");
  if (row.paidAt) throw new StatementError("ALREADY_PAID");
  if (row.evidenceStatus !== "PENDING" && row.evidenceStatus !== "REJECTED") throw new StatementError("NOT_SUBMITTABLE");
  if (!DATE_RE.test(input.issueDate)) throw new StatementError("DATE_INVALID");
  checkPhotoPaths(row.id, input.photoPaths, { min: 1, max: 3 });
  if ((await findMissingPhotos(input.photoPaths)).length > 0) throw new StatementError("PHOTO_MISSING");

  const { vatAmount, payAmount } = computeAmounts(row.baseAmount, flow);
  await prisma.settlementStatement.update({
    where: { id: row.id },
    data: {
      taxDocType,
      vatAmount,
      payAmount,
      evidenceStatus: "SUBMITTED",
      evidencePhotoPaths: input.photoPaths,
      invoiceIssueDate: input.issueDate,
      evidenceSubmittedAt: new Date(),
      evidenceRejectReason: null,
      evidenceReviewedAt: null,
      evidenceReviewedBy: null,
    },
  });
}

/** 현금영수증 승인번호 제출. 지급 후, 대기·반려 상태에서만. 사진은 선택. */
export async function submitCashReceipt(input: {
  installerId: string;
  statementId: string;
  receiptNo: string;
  receiptDate: string;
  photoPaths: string[];
}): Promise<void> {
  const { row, flow } = await loadOwnStatement(input.installerId, input.statementId);
  if (flow !== "CASH" || row.taxDocType !== "CASH_RECEIPT") throw new StatementError("FLOW_MISMATCH");
  if (!row.paidAt) throw new StatementError("NOT_PAID_YET");
  if (row.evidenceStatus !== "PENDING" && row.evidenceStatus !== "REJECTED") throw new StatementError("NOT_SUBMITTABLE");
  const receiptNo = input.receiptNo.replace(/[^\dA-Za-z]/g, "");
  if (receiptNo.length < 6 || receiptNo.length > 20) throw new StatementError("RECEIPT_NO_INVALID");
  if (!DATE_RE.test(input.receiptDate)) throw new StatementError("DATE_INVALID");
  checkPhotoPaths(row.id, input.photoPaths, { min: 0, max: 2 });
  if ((await findMissingPhotos(input.photoPaths)).length > 0) throw new StatementError("PHOTO_MISSING");

  await prisma.settlementStatement.update({
    where: { id: row.id },
    data: {
      evidenceStatus: "SUBMITTED",
      cashReceiptNo: receiptNo,
      cashReceiptDate: input.receiptDate,
      evidencePhotoPaths: input.photoPaths,
      evidenceSubmittedAt: new Date(),
      evidenceRejectReason: null,
      evidenceReviewedAt: null,
      evidenceReviewedBy: null,
    },
  });
}

// ── 본사 확인 · 지급 ─────────────────────────────────────────────────────

export async function reviewEvidence(input: {
  statementId: string;
  adminId: string;
  approve: boolean;
  rejectReason?: string;
}): Promise<void> {
  const row = await prisma.settlementStatement.findUnique({ where: { id: input.statementId } });
  if (!row) throw new StatementError("NOT_FOUND");
  if (row.evidenceStatus !== "SUBMITTED") throw new StatementError("NOT_SUBMITTED");
  const reason = input.rejectReason?.trim() ?? "";
  if (!input.approve && !reason) throw new StatementError("REJECT_REASON_REQUIRED");
  await prisma.settlementStatement.update({
    where: { id: row.id },
    data: {
      evidenceStatus: input.approve ? "CONFIRMED" : "REJECTED",
      evidenceRejectReason: input.approve ? null : reason,
      evidenceReviewedAt: new Date(),
      evidenceReviewedBy: input.adminId,
    },
  });
  if (!input.approve) {
    const what = row.taxDocType === "CASH_RECEIPT" ? "현금영수증" : "세금계산서";
    await notify(row.installerId, `${formatYm(row.ym)} ${what}가 반려됐습니다`, `사유: ${reason}`);
  }
}

/** 지급 가능 여부와 이유. 화면 표시와 지급 처리가 같은 규칙을 쓴다. */
export function payBlockReason(v: Pick<StatementView, "flow" | "evidenceStatus" | "paidAt" | "infoStatus">): string | null {
  if (v.paidAt) return "이미 지급";
  if (v.infoStatus !== "APPROVED") return "정산 정보 미승인";
  if (!v.flow) return "증빙 종류 미선택";
  if (v.flow === "TAX" && v.evidenceStatus !== "CONFIRMED") return "세금계산서 확인 전";
  return null;
}

export async function markPaid(input: { statementIds: string[]; adminId: string }): Promise<number> {
  const ids = [...new Set(input.statementIds)];
  if (ids.length === 0) return 0;
  const rows = await loadStatements({ id: { in: ids } });
  const targets = (await Promise.all(rows.map((r) => toView(r, false)))).filter(
    (v) => payBlockReason(v) === null,
  );
  if (targets.length !== ids.length) throw new StatementError("SOME_NOT_PAYABLE");

  const now = new Date();
  await prisma.$transaction(
    targets.map((v) =>
      prisma.settlementStatement.update({
        where: { id: v.id },
        data: {
          taxDocType: v.taxDocType,
          vatAmount: v.vatAmount,
          payAmount: v.payAmount,
          paidAt: now,
          paidByAdminId: input.adminId,
        },
      }),
    ),
  );

  await Promise.all(
    targets.map((v) =>
      v.flow === "CASH"
        ? notify(
            v.installerId,
            `${formatYm(v.ym)} 정산금 ${v.payAmount.toLocaleString()}원 지급 완료`,
            "본사 사업자번호로 지출증빙 현금영수증을 발급하고 앱에 승인번호를 등록해 주세요. 등록 전에는 앱 사용이 제한됩니다.",
          )
        : notify(v.installerId, `${formatYm(v.ym)} 정산금 ${v.payAmount.toLocaleString()}원 지급 완료`, "확인해 주세요."),
    ),
  );
  return targets.length;
}

async function notify(installerId: string, title: string, body: string) {
  try {
    await sendAssignmentPushToInstaller(installerId, { title, body });
  } catch (error) {
    console.error("[settlement/statements/push]", error);
  }
}

/** 기사 정산 기능 공개 여부(시스템 설정). 꺼져 있으면 기사 앱·백오피스에서 숨기고 발행을 막는다. */
export async function isSettlementLaunched(): Promise<boolean> {
  return isSystemSettingEnabled(SYSTEM_SETTING_KEYS.installerSettlementLaunched);
}
