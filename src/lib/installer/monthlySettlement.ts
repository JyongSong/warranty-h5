import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { getAsSymptomLabel } from "@/lib/installation/as/symptom-codes";
import { listInstallerOwnSettlementLines } from "@/lib/installation/settlement/service";

/**
 * 기사 앱의 월 단위 정산 화면용 데이터.
 *
 * 정산 라인은 본사 승인 시점에 생기므로, 여기 잡히는 건 "금액이 확정된 일"뿐이다.
 * 완료 등록만 하고 아직 승인 전인 건은 금액이 없어 pendingReviewCount 로만 센다.
 *
 * 월 경계는 달력 월(KST)이다. settlement_periods 는 쓰지 않는다.
 */

export type MonthlySettlementRow = {
  id: string;
  sourceType: "INSTALL" | "AS";
  sourceOrderId: string;
  /** KST YYYY-MM-DD */
  completedDate: string;
  /** 설치는 제품 요약, A/S 는 증상명 */
  label: string;
  address: string | null;
  linkageFee: number;
  travelFee: number;
  longDistanceFee: number;
  nightWeekendFee: number;
  serviceFee: number;
  /** 현장에서 기사가 직접 받은 금액. 정산 합계에 포함되지 않는다. */
  wallpadAmount: number;
  totalAmount: number;
};

export type MonthlySettlement = {
  /** YYYY-MM */
  ym: string;
  total: number;
  installCount: number;
  installAmount: number;
  asCount: number;
  asAmount: number;
  wallpadTotal: number;
  /** 완료 등록했지만 본사 승인 전이라 금액이 확정되지 않은 건수 */
  pendingReviewCount: number;
  rows: MonthlySettlementRow[];
};

export function isValidYm(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

/** 오늘이 속한 달 (KST) */
export function currentYm(now = new Date()): string {
  return toKstDate(now).slice(0, 7);
}

export function shiftYm(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  // Date.UTC 로 월 오버플로를 처리한다 (2026-12 +1 → 2027-01).
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startDate: `${ym}-01`, endDate: `${ym}-${String(lastDay).padStart(2, "0")}` };
}

function toKstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getInstallerMonthlySettlement(
  installerId: string,
  ym: string,
): Promise<MonthlySettlement> {
  const { startDate, endDate } = monthRange(ym);

  const [lines, pendingReviewCount] = await Promise.all([
    listInstallerOwnSettlementLines(installerId, { startDate, endDate }),
    countPendingReview(installerId),
  ]);

  const installIds = lines.filter((l) => l.sourceType === "INSTALL").map((l) => l.sourceOrderId);
  const asIds = lines.filter((l) => l.sourceType === "AS").map((l) => l.sourceOrderId);

  // 정산 라인에는 주소·제품이 없어 원본 주문에서 채운다. 그 달의 건만 조회한다.
  const [installMeta, asMeta] = await Promise.all([
    loadInstallMeta(installIds),
    loadAsMeta(asIds),
  ]);

  const rows: MonthlySettlementRow[] = lines.map((line) => {
    const meta =
      line.sourceType === "AS"
        ? asMeta.get(line.sourceOrderId)
        : installMeta.get(line.sourceOrderId);

    return {
      id: line.id,
      sourceType: line.sourceType === "AS" ? "AS" : "INSTALL",
      sourceOrderId: line.sourceOrderId,
      completedDate: toKstDate(new Date(line.completedAt)),
      label: meta?.label ?? (line.sourceType === "AS" ? "A/S" : "설치"),
      address: meta?.address ?? null,
      linkageFee: line.linkageFee,
      travelFee: line.travelFee,
      longDistanceFee: line.longDistanceFee,
      nightWeekendFee: line.nightWeekendFee,
      serviceFee: line.serviceFee,
      wallpadAmount: line.wallpadAmount,
      totalAmount: line.totalAmount,
    };
  });

  const installRows = rows.filter((r) => r.sourceType === "INSTALL");
  const asRows = rows.filter((r) => r.sourceType === "AS");
  const sum = (list: MonthlySettlementRow[]) => list.reduce((acc, r) => acc + r.totalAmount, 0);

  return {
    ym,
    total: sum(rows),
    installCount: installRows.length,
    installAmount: sum(installRows),
    asCount: asRows.length,
    asAmount: sum(asRows),
    wallpadTotal: rows.reduce((acc, r) => acc + r.wallpadAmount, 0),
    pendingReviewCount,
    rows,
  };
}

type Meta = { label: string; address: string | null };

/**
 * 주소는 이 화면에서 보조 정보다. 복호화가 실패해도(키 불일치, 과거 포맷 등)
 * 그 달의 정산 금액 전체가 500 으로 죽으면 안 되므로 삼킨다.
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptNullablePii(value);
  } catch (error) {
    console.error("[installer/settlement/decrypt]", error);
    return null;
  }
}

async function loadInstallMeta(ids: string[]): Promise<Map<string, Meta>> {
  if (ids.length === 0) return new Map();

  const orders = await prisma.installationOrder.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      source: { select: { memo: true } },
      customerRequests: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { installAddressEncrypted: true, installAddressDetailEncrypted: true },
      },
    },
  });

  return new Map(
    orders.map((order) => {
      const req = order.customerRequests[0] ?? null;
      const address =
        [safeDecrypt(req?.installAddressEncrypted), safeDecrypt(req?.installAddressDetailEncrypted)]
          .filter(Boolean)
          .join(" ") || null;
      return [order.id, { label: summarizeProducts(order.source?.memo), address }];
    }),
  );
}

async function loadAsMeta(ids: string[]): Promise<Map<string, Meta>> {
  if (ids.length === 0) return new Map();

  const orders = await prisma.asOrder.findMany({
    where: { id: { in: ids } },
    select: { id: true, symptomCode: true, addressEncrypted: true },
  });

  return new Map(
    orders.map((order) => [
      order.id,
      { label: getAsSymptomLabel(order.symptomCode), address: safeDecrypt(order.addressEncrypted) },
    ]),
  );
}

/**
 * 완료 등록 후 본사 승인을 기다리는 건수 (설치 + A/S).
 * 월과 무관하게 "지금 대기 중"인 수를 센다 — 기사가 알고 싶은 건 언제 확정되냐다.
 */
async function countPendingReview(installerId: string): Promise<number> {
  const [installCount, asCount] = await Promise.all([
    prisma.installationOrder.count({
      where: { currentInstallerId: installerId, status: "WAITING_HQ_REVIEW" },
    }),
    prisma.asOrder.count({
      where: { currentInstallerId: installerId, status: "WAITING_HQ_REVIEW" },
    }),
  ]);
  return installCount + asCount;
}

// orders.ts 와 같은 규칙 (첫 상품 + 외 N).
function summarizeProducts(memo: string | null | undefined): string {
  const products = (memo ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (products.length === 0) return "설치";
  if (products.length === 1) return products[0];
  return `${products[0]} 외 ${products.length - 1}건`;
}
