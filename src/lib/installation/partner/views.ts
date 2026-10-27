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
  partnerId: true,
  partnerStatus: true,
  partnerAssignedAt: true,
  partnerStatusChangedAt: true,
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
  partnerId: string | null;
  partnerStatus: string | null;
  partnerAssignedAt: Date | null;
  partnerStatusChangedAt: Date | null;
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
  partnerStatus: string | null;
  partnerAssignedAt: Date | null;
  partnerStatusChangedAt: Date | null;
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
    partnerStatus: order.partnerStatus,
    partnerAssignedAt: order.partnerAssignedAt,
    partnerStatusChangedAt: order.partnerStatusChangedAt,
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

  return {
    ...shapeOrder(order),
    partnerName: order.partner?.name ?? null,
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
