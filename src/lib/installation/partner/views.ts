import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { getCompletionPhotoSignedUrls, type CompletionPhoto } from "@/lib/installer/storage";
import { INSTALLATION_ORDER_STATUSES } from "@/lib/installation/orders/status";
import { DEFAULT_PARTNER_CODE, hasPartnerServiceItem } from "@/lib/installation/partner/routing";
import { canSwitchToInhouse, canSwitchToPartner } from "@/lib/installation/partner/service";

// 협력사 화면(/partner)과 본사 상세의 협력사 패널이 같이 쓰는 조회.

export const PARTNER_ORDER_VIEWS = {
  active: { label: "진행 중", statuses: [INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED] },
  review: { label: "본사 검수 중", statuses: [INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW] },
  completed: { label: "완료", statuses: [INSTALLATION_ORDER_STATUSES.COMPLETED] },
  cancelled: { label: "취소", statuses: [INSTALLATION_ORDER_STATUSES.CANCELLED] },
} as const;

export type PartnerOrderView = keyof typeof PARTNER_ORDER_VIEWS;

export function normalizePartnerOrderView(value: string | string[] | undefined): PartnerOrderView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw in PARTNER_ORDER_VIEWS ? (raw as PartnerOrderView) : "active";
}

const ORDER_SELECT = {
  id: true,
  status: true,
  statusChangedAt: true,
  partnerId: true,
  partnerStatus: true,
  partnerAssignedAt: true,
  partnerStatusChangedAt: true,
  partnerClaimAmount: true,
  partnerInstaller: true,
  source: {
    select: {
      customerNameEncrypted: true,
      phoneEncrypted: true,
      addressEncrypted: true,
      memo: true,
      orderNumbers: true,
      noGirl: true,
      externalOrderNo: true,
    },
  },
  activeCustomerRequest: {
    select: {
      customerNameEncrypted: true,
      customerPhoneEncrypted: true,
      ordererPhoneEncrypted: true,
      installAddressEncrypted: true,
      installAddressDetailEncrypted: true,
      installDate: true,
      installTimeSlot: true,
      customerNote: true,
    },
  },
} as const;

type OrderRow = {
  id: string;
  status: string;
  statusChangedAt: Date;
  partnerId: string | null;
  partnerStatus: string | null;
  partnerAssignedAt: Date | null;
  partnerStatusChangedAt: Date | null;
  partnerClaimAmount: number | null;
  partnerInstaller: string | null;
  source: {
    customerNameEncrypted: string | null;
    phoneEncrypted: string | null;
    addressEncrypted: string | null;
    memo: string | null;
    orderNumbers: string | null;
    noGirl: string | null;
    externalOrderNo: string | null;
  } | null;
  activeCustomerRequest: {
    customerNameEncrypted: string | null;
    customerPhoneEncrypted: string | null;
    ordererPhoneEncrypted: string | null;
    installAddressEncrypted: string | null;
    installAddressDetailEncrypted: string | null;
    installDate: string | null;
    installTimeSlot: string | null;
    customerNote: string | null;
  } | null;
};

export type PartnerOrderSummary = {
  id: string;
  status: string;
  /** 본사 검수 승인으로 완료된 시각. 완료 건만 값이 있다. */
  completedAt: Date | null;
  partnerStatus: string | null;
  partnerAssignedAt: Date | null;
  partnerStatusChangedAt: Date | null;
  /** 협력사가 본사에 청구하는 시공비(원) */
  claimAmount: number | null;
  /** 협력사가 적은 담당 기사 */
  installer: string | null;
  customerName: string | null;
  customerPhone: string | null;
  backupPhone: string | null;
  address: string | null;
  installDate: string | null;
  installTimeSlot: string | null;
  customerNote: string | null;
  memo: string | null;
  orderNumber: string | null;
};

function shapeOrder(order: OrderRow): PartnerOrderSummary {
  const request = order.activeCustomerRequest;
  const address =
    [decryptNullablePii(request?.installAddressEncrypted), decryptNullablePii(request?.installAddressDetailEncrypted)]
      .filter(Boolean)
      .join(" ") || decryptNullablePii(order.source?.addressEncrypted);

  return {
    id: order.id,
    status: order.status,
    completedAt: order.status === INSTALLATION_ORDER_STATUSES.COMPLETED ? order.statusChangedAt : null,
    partnerStatus: order.partnerStatus,
    partnerAssignedAt: order.partnerAssignedAt,
    partnerStatusChangedAt: order.partnerStatusChangedAt,
    claimAmount: order.partnerClaimAmount,
    installer: order.partnerInstaller,
    customerName:
      decryptNullablePii(request?.customerNameEncrypted) ?? decryptNullablePii(order.source?.customerNameEncrypted),
    customerPhone:
      decryptNullablePii(request?.customerPhoneEncrypted) ?? decryptNullablePii(order.source?.phoneEncrypted),
    backupPhone: decryptNullablePii(request?.ordererPhoneEncrypted),
    address,
    installDate: request?.installDate ?? null,
    installTimeSlot: request?.installTimeSlot ?? null,
    customerNote: request?.customerNote ?? null,
    memo: order.source?.memo ?? null,
    orderNumber: order.source?.orderNumbers ?? order.source?.externalOrderNo ?? order.source?.noGirl ?? null,
  };
}

export async function listPartnerOrders(partnerId: string, view: PartnerOrderView) {
  const orders = await prisma.installationOrder.findMany({
    where: { partnerId, status: { in: [...PARTNER_ORDER_VIEWS[view].statuses] } },
    orderBy: { partnerAssignedAt: view === "active" ? "asc" : "desc" },
    take: 200,
    select: ORDER_SELECT,
  });
  return orders.map(shapeOrder);
}

// ── 완료 탭: 기간별 이력 · 청구 합계 ───────────────────────────────────

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PartnerCompletedRange = { from: string; to: string };

export function toKstYmd(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 완료 탭 기간. 값이 없거나 이상하면 이번 달 1일 ~ 오늘(KST). 시작이 끝보다 늦으면 바꿔 준다. */
export function normalizePartnerCompletedRange(
  rawFrom: string | string[] | undefined,
  rawTo: string | string[] | undefined,
  now = new Date(),
): PartnerCompletedRange {
  const today = toKstYmd(now);
  const pick = (value: string | string[] | undefined) => {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw && YMD_PATTERN.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? raw : null;
  };
  const from = pick(rawFrom) ?? `${today.slice(0, 7)}-01`;
  const to = pick(rawTo) ?? today;
  return from <= to ? { from, to } : { from: to, to: from };
}

function kstDayStart(ymd: string) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - KST_OFFSET_MS);
}

export type PartnerCompletedSummary = {
  orders: PartnerOrderSummary[];
  totalAmount: number;
  /** 본사 검수 중이라 아직 합계에 들어가지 않은 건 (기간 무관) */
  pendingReviewCount: number;
  pendingReviewAmount: number;
};

/** 본사 승인(완료) 일자가 기간 안에 드는 협력사 완료 건과 청구 금액 합계. */
export async function getPartnerCompletedSummary(
  partnerId: string,
  range: PartnerCompletedRange,
): Promise<PartnerCompletedSummary> {
  const end = new Date(kstDayStart(range.to).getTime() + 24 * 60 * 60 * 1000);
  const [orders, pending] = await Promise.all([
    prisma.installationOrder.findMany({
      where: {
        partnerId,
        status: INSTALLATION_ORDER_STATUSES.COMPLETED,
        statusChangedAt: { gte: kstDayStart(range.from), lt: end },
      },
      orderBy: { statusChangedAt: "desc" },
      take: 500,
      select: ORDER_SELECT,
    }),
    prisma.installationOrder.aggregate({
      where: { partnerId, status: INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW },
      _count: { _all: true },
      _sum: { partnerClaimAmount: true },
    }),
  ]);
  const shaped = orders.map(shapeOrder);

  return {
    orders: shaped,
    totalAmount: shaped.reduce((sum, order) => sum + (order.claimAmount ?? 0), 0),
    pendingReviewCount: pending._count._all,
    pendingReviewAmount: pending._sum.partnerClaimAmount ?? 0,
  };
}

export async function countPartnerOrdersByView(partnerId: string) {
  const rows = await prisma.installationOrder.groupBy({
    by: ["status"],
    where: { partnerId },
    _count: { _all: true },
  });
  const countByStatus = new Map(rows.map((row) => [row.status as string, row._count._all]));
  return Object.fromEntries(
    Object.entries(PARTNER_ORDER_VIEWS).map(([view, config]) => [
      view,
      config.statuses.reduce((sum, status) => sum + (countByStatus.get(status) ?? 0), 0),
    ]),
  ) as Record<PartnerOrderView, number>;
}

export type PartnerNoteItem = {
  id: string;
  authorType: string;
  kind: string;
  partnerStatus: string | null;
  body: string | null;
  photos: CompletionPhoto[];
  createdAt: Date;
};

export type PartnerOrderDetail = PartnerOrderSummary & {
  partnerName: string | null;
  /** 협력사가 처음 청구 금액을 넣은(접수한) 시각 */
  acceptedAt: Date | null;
  /** 마지막 설치 완료 등록 시각 */
  completionSubmittedAt: Date | null;
  notes: PartnerNoteItem[];
};

/**
 * 협력사 주문 상세. partnerId 를 주면 그 협력사 주문만 돌려준다(협력사 화면).
 * 본사 상세는 partnerId 없이 부른다.
 */
export async function getPartnerOrderDetail(
  orderId: string,
  { partnerId }: { partnerId?: string } = {},
): Promise<PartnerOrderDetail | null> {
  const order = await prisma.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      ...ORDER_SELECT,
      partner: { select: { name: true } },
      partnerNotes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return null;
  if (partnerId !== undefined && order.partnerId !== partnerId) return null;
  // 본사 화면에서는 협력사와 무관한 주문이면 패널을 그리지 않는다.
  if (partnerId === undefined && !order.partnerId && order.partnerNotes.length === 0) return null;

  const notes = await Promise.all(
    order.partnerNotes.map(async (note) => ({
      id: note.id,
      authorType: note.authorType,
      kind: note.kind,
      partnerStatus: note.partnerStatus,
      body: note.body,
      photos: await getCompletionPhotoSignedUrls(note.photoPaths),
      createdAt: note.createdAt,
    })),
  );

  const completionNotes = order.partnerNotes.filter((note) => note.kind === "COMPLETION");
  return {
    ...shapeOrder(order),
    partnerName: order.partner?.name ?? null,
    acceptedAt: order.partnerNotes.find((note) => note.kind === "AMOUNT")?.createdAt ?? null,
    completionSubmittedAt: completionNotes.at(-1)?.createdAt ?? null,
    notes,
  };
}

export type BackofficePartnerPanelData = {
  orderStatus: string;
  partnerRouting: string | null;
  hasPartnerServiceItem: boolean;
  partnerConfigured: boolean;
  canSwitchToPartner: boolean;
  canSwitchToInhouse: boolean;
  detail: PartnerOrderDetail | null;
};

/** 본사 설치 상세의 협력사 패널 데이터. */
export async function getBackofficePartnerPanelData(orderId: string): Promise<BackofficePartnerPanelData | null> {
  const [order, partner] = await Promise.all([
    prisma.installationOrder.findUnique({
      where: { id: orderId },
      select: { status: true, partnerId: true, partnerRouting: true, source: { select: { memo: true } } },
    }),
    prisma.installationPartner.findUnique({ where: { code: DEFAULT_PARTNER_CODE }, select: { active: true } }),
  ]);
  if (!order) return null;

  return {
    orderStatus: order.status,
    partnerRouting: order.partnerRouting,
    hasPartnerServiceItem: hasPartnerServiceItem(order.source?.memo),
    partnerConfigured: Boolean(partner?.active),
    canSwitchToPartner: Boolean(partner?.active) && canSwitchToPartner(order),
    canSwitchToInhouse: canSwitchToInhouse(order),
    detail: await getPartnerOrderDetail(orderId),
  };
}
