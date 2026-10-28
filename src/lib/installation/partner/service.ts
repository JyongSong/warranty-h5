import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptNullablePii, encryptNullablePii, hmacPii, normalizePhone11 } from "@/lib/piiCrypto";
import { INSTALLATION_ORDER_STATUSES, transitionInstallationOrderStatus } from "@/lib/installation/orders/status";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { buildPartnerAssignmentRequestSmsContent } from "@/lib/installation/notifications/sms-content";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import { findMissingPhotos } from "@/lib/installer/storage";
import {
  deriveInstallItemsFromMemo,
  formatInstallItemsText,
  normalizeInstallItems,
  PartnerInstallItemsError,
  resolvePartnerInstallItems,
  type PartnerInstallItem,
} from "@/lib/installation/partner/install-items";
import {
  DEFAULT_PARTNER_CODE,
  PARTNER_ROUTING,
  PARTNER_SERVICE_ITEM_NAMES,
  PARTNER_STATUSES,
} from "@/lib/installation/partner/routing";

// 외부 협력사(PL) 배정 건의 상태 변경. 주문 상태는 기존 흐름을 그대로 쓴다.
//   협력사 배정       → INSTALLER_ASSIGNED (currentInstaller 없음, partnerId 있음)
//   협력사 완료 등록  → WAITING_HQ_REVIEW
//   본사 승인 / 반려  → COMPLETED / INSTALLER_ASSIGNED
// partnerStatus 는 본사가 알아야 할 것만: 신규 → 접수(청구 금액 입력) → 완료 등록 → 완료 / 설치 불가.
// 협력사 안의 기사 배정·일정은 협력사가 알아서 하고 남기지 않는다.

export const PARTNER_COMPLETION_PHOTO_MAX = 10;
// 협력사 청구 시공비 상한. 오타(0 하나 더)를 막는 정도의 값이다.
export const PARTNER_CLAIM_AMOUNT_MAX = 10_000_000;
const NOTE_BODY_MAX = 2000;

export class InstallationPartnerError extends Error {}

type Actor = { actorType: "SYSTEM" | "ADMIN" | "PARTNER"; actorId?: string | null };

const ACTIVE_ASSIGNMENT_STATUSES = [
  "WAITING_ADMIN_REVIEW",
  "WAITING_INSTALLER_RESPONSE",
  "SYSTEM_SMS_RETRY_PENDING",
] as const;

export type AssignReadyOrdersToPartnerResult = {
  assignedCount: number;
  failedCount: number;
  skippedNoPartner?: boolean;
};

/**
 * 고객 입력이 끝난(READY_FOR_CANDIDATE_SELECTION) PL 용역 품목(도어락팀 밖의 설치) 건을 협력사에 넘긴다.
 * 디스패처에서 자사 기사 자동배정보다 먼저 돈다. 자사 배정과 달리 설치 희망일
 * 10일 이내를 기다리지 않는다 — 일정은 협력사가 직접 잡는다.
 */
export async function assignReadyOrdersToPartner({
  now = new Date(),
  limit = 25,
  baseUrl,
}: { now?: Date; limit?: number; baseUrl?: string } = {}): Promise<AssignReadyOrdersToPartnerResult> {
  const partner = await prisma.installationPartner.findUnique({ where: { code: DEFAULT_PARTNER_CODE } });
  if (!partner?.active) return { assignedCount: 0, failedCount: 0, skippedNoPartner: true };

  const orders = await prisma.installationOrder.findMany({
    where: {
      status: INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
      activeAssignmentId: null,
      partnerId: null,
      hasOpenIssue: false,
      customerRequests: { some: { status: { in: ["SUBMITTED", "FALLBACK_USED"] } } },
      OR: [
        { partnerRouting: PARTNER_ROUTING.PARTNER },
        {
          partnerRouting: null,
          source: { OR: PARTNER_SERVICE_ITEM_NAMES.map((name) => ({ memo: { contains: name } })) },
        },
      ],
    },
    orderBy: { statusChangedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let assignedCount = 0;
  let failedCount = 0;
  for (const order of orders) {
    try {
      await prisma.$transaction((tx) =>
        assignOrderToPartnerInTx(tx, order.id, partner, { actorType: "SYSTEM" }, { now, baseUrl }),
      );
      assignedCount += 1;
    } catch (error) {
      console.error("[installation/partner/assign]", order.id, error);
      failedCount += 1;
    }
  }

  return { assignedCount, failedCount };
}

type PartnerRow = { id: string; name: string; notifyPhone: string | null };
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function assignOrderToPartnerInTx(
  tx: Tx,
  orderId: string,
  partner: PartnerRow,
  actor: Actor,
  { now, baseUrl, reason }: { now: Date; baseUrl?: string; reason?: string | null },
) {
  const order = await tx.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      activeAssignmentId: true,
      activeCustomerRequestId: true,
      source: { select: { memo: true } },
      activeCustomerRequest: { select: { installDate: true, installAddress1Encrypted: true } },
    },
  });
  if (!order) throw new InstallationPartnerError("ORDER_NOT_FOUND");

  if (order.activeAssignmentId) {
    await tx.installationInstallerAssignmentAttempt.updateMany({
      where: { id: order.activeAssignmentId, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
      data: {
        status: "ADMIN_MANUAL_OVERRIDDEN",
        cancelledByAdminId: actor.actorType === "ADMIN" ? (actor.actorId ?? null) : null,
      },
    });
  }

  await transitionInstallationOrderStatus(
    orderId,
    INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED,
    {
      now,
      orderData: {
        activeAssignmentId: null,
        currentInstallerId: null,
        partnerId: partner.id,
        partnerAssignedAt: now,
        partnerStatus: PARTNER_STATUSES.RECEIVED,
        partnerStatusChangedAt: now,
      },
      event: {
        eventType: "PARTNER_ASSIGNED",
        actorType: actor.actorType,
        actorId: actor.actorId ?? null,
        reason: reason ?? null,
        metadata: { partnerId: partner.id, previousStatus: order.status },
      },
    },
    tx as never,
  );

  await tx.installationPartnerNote.create({
    data: {
      installationOrderId: orderId,
      partnerId: partner.id,
      authorUserId: actor.actorType === "SYSTEM" ? null : (actor.actorId ?? null),
      authorType: actor.actorType === "SYSTEM" ? "SYSTEM" : "HQ",
      kind: "STATUS",
      partnerStatus: PARTNER_STATUSES.RECEIVED,
      body: reason?.trim() || `${partner.name} 에 배정되었습니다.`,
      createdAt: now,
    },
  });

  const notifyPhone = normalizePartnerPhone(partner.notifyPhone);
  if (notifyPhone) {
    const partnerUrl = `${stripTrailingSlash(baseUrl ?? getSmsLinkBaseUrl())}/partner/orders/${encodeURIComponent(orderId)}`;
    const smsContent = buildPartnerAssignmentRequestSmsContent({
      addressMain: decryptNullablePii(order.activeCustomerRequest?.installAddress1Encrypted),
      installDate: order.activeCustomerRequest?.installDate ?? null,
      productSummary: order.source?.memo ?? null,
      partnerUrl,
    });
    await tx.installationNotification.upsert({
      where: { idempotencyKey: `partner-assignment-request:${orderId}:${now.getTime()}` },
      create: {
        installationOrderId: orderId,
        customerRequestId: order.activeCustomerRequestId,
        smsType: "PARTNER_ASSIGNMENT_REQUEST",
        recipientType: "PARTNER",
        recipientPhoneEncrypted: encryptNullablePii(notifyPhone),
        recipientPhoneHash: hmacPii(notifyPhone),
        smsTemplateKey: smsContent.templateKey,
        smsBody: smsContent.text,
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: `partner-assignment-request:${orderId}:${now.getTime()}`,
      },
      update: {},
    });
  }
}

export async function getInstallationPartnerByCode(code: string) {
  const partner = await prisma.installationPartner.findUnique({
    where: { code },
    select: { id: true, name: true, active: true },
  });
  return partner?.active ? partner : null;
}

// ── 본사: 수동 전환 ──────────────────────────────────────────────────────

const SWITCH_TO_PARTNER_NOW_STATUSES: readonly string[] = [
  INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
  INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW,
  INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
];
const SWITCH_TO_PARTNER_LATER_STATUSES: readonly string[] = [
  INSTALLATION_ORDER_STATUSES.CUSTOMER_INPUT_SMS_REQUIRED,
  INSTALLATION_ORDER_STATUSES.WAITING_CUSTOMER_INPUT,
];

export function canSwitchToPartner(order: { status: string; partnerId: string | null }) {
  if (order.partnerId) return false;
  return (
    SWITCH_TO_PARTNER_NOW_STATUSES.includes(order.status) ||
    SWITCH_TO_PARTNER_LATER_STATUSES.includes(order.status)
  );
}

export function canSwitchToInhouse(order: { status: string; partnerId: string | null }) {
  return Boolean(order.partnerId) && order.status === INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED;
}

/**
 * 자동 판별이 틀렸을 때 본사가 협력사로 넘긴다. 고객 입력 전이면 표시만 해 두고
 * 고객이 제출하면 디스패처가 넘긴다. 고객 입력 후면 진행 중인 기사 배정을 끊고 바로 넘긴다.
 */
export async function switchOrderToPartner(
  orderId: string,
  { adminId, reason, now = new Date() }: { adminId: string; reason?: string | null; now?: Date },
) {
  const partner = await prisma.installationPartner.findUnique({ where: { code: DEFAULT_PARTNER_CODE } });
  if (!partner?.active) throw new InstallationPartnerError("PARTNER_NOT_CONFIGURED");

  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, partnerId: true },
    });
    if (!order) throw new InstallationPartnerError("ORDER_NOT_FOUND");
    if (!canSwitchToPartner(order)) throw new InstallationPartnerError("ORDER_NOT_PARTNER_SWITCHABLE");

    await tx.installationOrder.update({
      where: { id: orderId },
      data: { partnerRouting: PARTNER_ROUTING.PARTNER },
    });

    if (SWITCH_TO_PARTNER_NOW_STATUSES.includes(order.status)) {
      await assignOrderToPartnerInTx(
        tx,
        orderId,
        partner,
        { actorType: "ADMIN", actorId: adminId },
        { now, reason: reason?.trim() || "본사가 협력사로 전환했습니다." },
      );
    }
  });
}

/** 협력사에서 빼서 자사 기사 자동배정으로 되돌린다. */
export async function switchOrderToInhouse(
  orderId: string,
  { adminId, reason, now = new Date() }: { adminId: string; reason: string; now?: Date },
) {
  const normalizedReason = requireText(reason, "REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, partnerId: true },
    });
    if (!order) throw new InstallationPartnerError("ORDER_NOT_FOUND");
    if (!canSwitchToInhouse(order)) throw new InstallationPartnerError("ORDER_NOT_INHOUSE_SWITCHABLE");

    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId: order.partnerId,
        authorUserId: adminId,
        authorType: "HQ",
        kind: "STATUS",
        partnerStatus: null,
        body: `자사 기사 배정으로 전환: ${normalizedReason}`,
        createdAt: now,
      },
    });

    await transitionInstallationOrderStatus(
      orderId,
      INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
      {
        now,
        orderData: {
          partnerId: null,
          partnerAssignedAt: null,
          partnerStatus: null,
          partnerStatusChangedAt: now,
          partnerRouting: PARTNER_ROUTING.INHOUSE,
        },
        event: {
          eventType: "PARTNER_UNASSIGNED",
          actorType: "ADMIN",
          actorId: adminId,
          reason: normalizedReason,
          metadata: { partnerId: order.partnerId },
        },
      },
      tx as never,
    );
  });
}

// ── 협력사: 진행 기록 ────────────────────────────────────────────────────

async function loadPartnerOrderForUpdate(tx: Tx, orderId: string, partnerId: string) {
  const order = await tx.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      partnerId: true,
      partnerStatus: true,
      partnerClaimAmount: true,
      partnerInstaller: true,
    },
  });
  // 다른 협력사 주문은 존재 여부도 알려주지 않는다.
  if (!order || order.partnerId !== partnerId) throw new InstallationPartnerError("ORDER_NOT_FOUND");
  return order;
}

function assertPartnerWorkable(order: { status: string; partnerStatus: string | null }) {
  if (order.status !== INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED) {
    throw new InstallationPartnerError("ORDER_NOT_WORKABLE");
  }
}

/** 협력사가 이 건을 맡을 수 없다고 알린다. 본사 예외로 올라가고, 본사가 취소하거나 자사로 돌린다. */
export async function reportPartnerUnable(
  orderId: string,
  { partnerId, userId, reason, now = new Date() }: { partnerId: string; userId: string; reason: string; now?: Date },
) {
  const normalizedReason = requireText(reason, "REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const order = await loadPartnerOrderForUpdate(tx, orderId, partnerId);
    assertPartnerWorkable(order);

    await tx.installationOrder.update({
      where: { id: orderId },
      data: { partnerStatus: PARTNER_STATUSES.UNABLE, partnerStatusChangedAt: now },
    });
    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId,
        authorUserId: userId,
        authorType: "PARTNER",
        kind: "STATUS",
        partnerStatus: PARTNER_STATUSES.UNABLE,
        body: normalizedReason,
        createdAt: now,
      },
    });
    await createInstallationIssue(
      {
        installationOrderId: orderId,
        type: "INSTALLATION_NOT_COMPLETED",
        title: "협력사 설치 불가",
        description: normalizedReason,
        metadata: { partnerId, partnerStatus: PARTNER_STATUSES.UNABLE },
        now,
      },
      tx as never,
    );
  });
}

export async function addPartnerNote(
  orderId: string,
  {
    authorType,
    partnerId,
    userId,
    body,
    now = new Date(),
  }: { authorType: "PARTNER" | "HQ"; partnerId: string | null; userId: string; body: string; now?: Date },
) {
  const normalizedBody = requireText(body, "NOTE_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const order =
      authorType === "PARTNER" && partnerId
        ? await loadPartnerOrderForUpdate(tx, orderId, partnerId)
        : await tx.installationOrder.findUnique({ where: { id: orderId }, select: { id: true, partnerId: true } });
    if (!order) throw new InstallationPartnerError("ORDER_NOT_FOUND");

    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId: order.partnerId,
        authorUserId: userId,
        authorType,
        kind: "NOTE",
        body: normalizedBody,
        createdAt: now,
      },
    });
  });
}

/**
 * 협력사가 본사에 청구할 시공비를 입력/수정한다. 접수 때 넣고, 완료 등록 전까지 고칠 수 있다.
 * 본사 승인은 없고 기록만 남긴다. 처음 입력이 아니면 사유를 받는다.
 */
export async function setPartnerClaimAmount(
  orderId: string,
  {
    partnerId,
    userId,
    amount,
    reason,
    now = new Date(),
  }: { partnerId: string; userId: string; amount: number; reason?: string | null; now?: Date },
) {
  if (!Number.isInteger(amount) || amount < 0 || amount > PARTNER_CLAIM_AMOUNT_MAX) {
    throw new InstallationPartnerError("CLAIM_AMOUNT_INVALID");
  }
  const normalizedReason = normalizeOptionalText(reason);

  return prisma.$transaction(async (tx) => {
    const order = await loadPartnerOrderForUpdate(tx, orderId, partnerId);
    assertPartnerWorkable(order);

    const previous = order.partnerClaimAmount;
    if (previous === amount) return;
    if (previous != null && !normalizedReason) throw new InstallationPartnerError("CLAIM_CHANGE_REASON_REQUIRED");

    // 처음 금액을 넣는 것이 곧 접수다.
    const accepting =
      order.partnerStatus === PARTNER_STATUSES.RECEIVED || order.partnerStatus === PARTNER_STATUSES.UNABLE;
    await tx.installationOrder.update({
      where: { id: orderId },
      data: {
        partnerClaimAmount: amount,
        ...(accepting ? { partnerStatus: PARTNER_STATUSES.ACCEPTED, partnerStatusChangedAt: now } : {}),
      },
    });
    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId,
        authorUserId: userId,
        authorType: "PARTNER",
        kind: "AMOUNT",
        partnerStatus: accepting ? PARTNER_STATUSES.ACCEPTED : null,
        body: [
          previous == null
            ? `접수 · 청구 금액 ${formatWon(amount)}`
            : `청구 금액 ${formatWon(previous)} → ${formatWon(amount)}`,
          normalizedReason,
        ]
          .filter(Boolean)
          .join("\n"),
        createdAt: now,
      },
    });
  });
}

const PARTNER_INSTALLER_MAX = 100;

/** 협력사가 이 건의 담당 기사를 적는다(이름·연락처 자유 입력). 고칠 때마다 기록이 남는다. */
export async function setPartnerInstaller(
  orderId: string,
  {
    partnerId,
    userId,
    installer,
    now = new Date(),
  }: { partnerId: string; userId: string; installer: string; now?: Date },
) {
  const normalized = installer.trim().replace(/\s+/g, " ");
  if (!normalized) throw new InstallationPartnerError("INSTALLER_REQUIRED");
  if (normalized.length > PARTNER_INSTALLER_MAX) throw new InstallationPartnerError("INSTALLER_TOO_LONG");

  return prisma.$transaction(async (tx) => {
    const order = await loadPartnerOrderForUpdate(tx, orderId, partnerId);
    assertPartnerWorkable(order);

    const previous = order.partnerInstaller;
    if (previous === normalized) return;

    await tx.installationOrder.update({
      where: { id: orderId },
      data: { partnerInstaller: normalized },
    });
    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId,
        authorUserId: userId,
        authorType: "PARTNER",
        kind: "INSTALLER",
        body: previous ? `담당 기사 ${previous} → ${normalized}` : `담당 기사 ${normalized}`,
        createdAt: now,
      },
    });
  });
}

/**
 * 본사 관리자가 협력사 주문의 설치 품목을 고친다. items 가 null 이면 저장값을 지우고 메모 자동 판별로 되돌린다.
 * 바뀐 내용은 진행 기록(ITEMS)에 남아 협력사 화면에서도 보인다.
 */
export async function setPartnerInstallItems(
  orderId: string,
  { adminId, items, now = new Date() }: { adminId: string; items: unknown[] | null; now?: Date },
) {
  let normalized: PartnerInstallItem[] | null;
  try {
    normalized = items === null ? null : normalizeInstallItems(items);
  } catch (error) {
    if (error instanceof PartnerInstallItemsError) throw new InstallationPartnerError(error.message);
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, partnerId: true, partnerInstallItems: true, source: { select: { memo: true } } },
    });
    if (!order) throw new InstallationPartnerError("ORDER_NOT_FOUND");
    if (!order.partnerId) throw new InstallationPartnerError("ORDER_NOT_PARTNER");
    if (order.status === INSTALLATION_ORDER_STATUSES.CANCELLED) throw new InstallationPartnerError("ORDER_NOT_WORKABLE");

    const before = resolvePartnerInstallItems(order.partnerInstallItems, order.source?.memo);
    const after = normalized
      ? { items: normalized, edited: true }
      : { items: deriveInstallItemsFromMemo(order.source?.memo), edited: false };
    if (before.edited === after.edited && JSON.stringify(before.items) === JSON.stringify(after.items)) return;

    await tx.installationOrder.update({
      where: { id: orderId },
      data: { partnerInstallItems: normalized ?? Prisma.DbNull },
    });
    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId: order.partnerId,
        authorUserId: adminId,
        authorType: "HQ",
        kind: "ITEMS",
        body: normalized
          ? `설치 품목 수정\n${formatInstallItemsText(after.items)}`
          : `설치 품목을 주문 상품 기준 자동 판별로 되돌림\n${formatInstallItemsText(after.items)}`,
        createdAt: now,
      },
    });
  });
}

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function isPartnerPhotoPathForOrder(orderId: string, path: string) {
  return path.startsWith(`partner/${orderId}/`) && !path.includes("..");
}

export async function submitPartnerCompletion(
  orderId: string,
  {
    partnerId,
    userId,
    body,
    photoPaths,
    now = new Date(),
  }: { partnerId: string; userId: string; body?: string | null; photoPaths: string[]; now?: Date },
) {
  // 진행 내용과 사진은 둘 다 선택이다. 청구 금액만 완료 전에 들어가 있어야 한다.
  const paths = Array.from(new Set(photoPaths.map((path) => path.trim()).filter(Boolean)));
  if (paths.length > PARTNER_COMPLETION_PHOTO_MAX) throw new InstallationPartnerError("PHOTO_COUNT_INVALID");
  if (!paths.every((path) => isPartnerPhotoPathForOrder(orderId, path))) {
    throw new InstallationPartnerError("PHOTO_PATH_INVALID");
  }
  if ((await findMissingPhotos(paths)).length > 0) throw new InstallationPartnerError("PHOTO_UPLOAD_INCOMPLETE");

  return prisma.$transaction(async (tx) => {
    const order = await loadPartnerOrderForUpdate(tx, orderId, partnerId);
    assertPartnerWorkable(order);
    if (order.partnerClaimAmount == null) throw new InstallationPartnerError("CLAIM_AMOUNT_REQUIRED");

    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId,
        authorUserId: userId,
        authorType: "PARTNER",
        kind: "COMPLETION",
        partnerStatus: PARTNER_STATUSES.COMPLETION_SUBMITTED,
        body: normalizeOptionalText(body),
        photoPaths: paths,
        createdAt: now,
      },
    });

    await transitionInstallationOrderStatus(
      orderId,
      INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW,
      {
        now,
        orderData: {
          partnerStatus: PARTNER_STATUSES.COMPLETION_SUBMITTED,
          partnerStatusChangedAt: now,
          partnerCompletedAt: now,
        },
        event: {
          eventType: "PARTNER_COMPLETION_SUBMITTED",
          actorType: "PARTNER",
          actorId: userId,
          metadata: { partnerId, photoCount: paths.length, claimAmount: order.partnerClaimAmount },
        },
      },
      tx as never,
    );
  });
}

// ── 본사: 검수 ───────────────────────────────────────────────────────────

export async function reviewPartnerCompletion(
  orderId: string,
  {
    adminId,
    approve,
    reason,
    now = new Date(),
  }: { adminId: string; approve: boolean; reason?: string | null; now?: Date },
) {
  const normalizedReason = approve ? normalizeOptionalText(reason) : requireText(reason ?? "", "REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, partnerId: true },
    });
    if (!order?.partnerId) throw new InstallationPartnerError("ORDER_NOT_FOUND");
    if (order.status !== INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW) {
      throw new InstallationPartnerError("ORDER_NOT_IN_REVIEW");
    }

    const nextPartnerStatus = approve ? PARTNER_STATUSES.COMPLETED : PARTNER_STATUSES.ACCEPTED;
    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId: order.partnerId,
        authorUserId: adminId,
        authorType: "HQ",
        kind: "REVIEW",
        partnerStatus: nextPartnerStatus,
        body: approve
          ? normalizedReason ?? "본사 검수 승인"
          : `본사 검수 반려: ${normalizedReason}`,
        createdAt: now,
      },
    });

    await transitionInstallationOrderStatus(
      orderId,
      approve ? INSTALLATION_ORDER_STATUSES.COMPLETED : INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED,
      {
        now,
        orderData: { partnerStatus: nextPartnerStatus, partnerStatusChangedAt: now },
        event: {
          eventType: approve ? "PARTNER_COMPLETION_APPROVED" : "PARTNER_COMPLETION_REJECTED",
          actorType: "ADMIN",
          actorId: adminId,
          reason: normalizedReason,
          metadata: { partnerId: order.partnerId },
        },
      },
      tx as never,
    );
  });
}

// ── helpers ─────────────────────────────────────────────────────────────

function normalizePartnerPhone(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    return normalizePhone11(value);
  } catch {
    console.error("[installation/partner] notify_phone 형식 오류");
    return null;
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > NOTE_BODY_MAX) throw new InstallationPartnerError("NOTE_TOO_LONG");
  return normalized;
}

function requireText(value: string, errorCode: string) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) throw new InstallationPartnerError(errorCode);
  return normalized;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
