import { prisma } from "@/lib/prisma";
import { decryptNullablePii, encryptNullablePii, hmacPii, normalizePhone11 } from "@/lib/piiCrypto";
import { INSTALLATION_ORDER_STATUSES, transitionInstallationOrderStatus } from "@/lib/installation/orders/status";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { buildPartnerAssignmentRequestSmsContent } from "@/lib/installation/notifications/sms-content";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import { findMissingPhotos } from "@/lib/installer/storage";
import {
  DEFAULT_PARTNER_CODE,
  PARTNER_ROUTING,
  PARTNER_SELECTABLE_STATUSES,
  PARTNER_SERVICE_ITEM_NAMES,
  PARTNER_STATUSES,
  type PartnerStatus,
} from "@/lib/installation/partner/routing";

// 외부 협력사(PL) 배정 건의 상태 변경. 주문 상태는 기존 흐름을 그대로 쓴다.
//   협력사 배정       → INSTALLER_ASSIGNED (currentInstaller 없음, partnerId 있음)
//   협력사 완료 등록  → WAITING_HQ_REVIEW
//   본사 승인 / 반려  → COMPLETED / INSTALLER_ASSIGNED
// 협력사 안의 세부 진행(접수 → 기사 배정 → 일정 확정)은 partnerStatus 에만 남긴다.

export const PARTNER_COMPLETION_PHOTO_MAX = 10;
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
 * 고객 입력이 끝난(READY_FOR_CANDIDATE_SELECTION) 조명·월패드 설치 건을 협력사에 넘긴다.
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
    select: { id: true, status: true, partnerId: true, partnerStatus: true },
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

export async function updatePartnerStatus(
  orderId: string,
  {
    partnerId,
    userId,
    status,
    body,
    now = new Date(),
  }: { partnerId: string; userId: string; status: string; body?: string | null; now?: Date },
) {
  if (!PARTNER_SELECTABLE_STATUSES.includes(status as PartnerStatus)) {
    throw new InstallationPartnerError("PARTNER_STATUS_INVALID");
  }
  const normalizedBody = normalizeOptionalText(body);
  if (status === PARTNER_STATUSES.UNABLE && !normalizedBody) {
    throw new InstallationPartnerError("REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const order = await loadPartnerOrderForUpdate(tx, orderId, partnerId);
    assertPartnerWorkable(order);

    await tx.installationOrder.update({
      where: { id: orderId },
      data: { partnerStatus: status, partnerStatusChangedAt: now },
    });
    await tx.installationPartnerNote.create({
      data: {
        installationOrderId: orderId,
        partnerId,
        authorUserId: userId,
        authorType: "PARTNER",
        kind: "STATUS",
        partnerStatus: status,
        body: normalizedBody,
        createdAt: now,
      },
    });

    if (status === PARTNER_STATUSES.UNABLE) {
      await createInstallationIssue(
        {
          installationOrderId: orderId,
          type: "INSTALLATION_NOT_COMPLETED",
          title: "협력사 설치 불가",
          description: normalizedBody,
          metadata: { partnerId, partnerStatus: status },
          now,
        },
        tx as never,
      );
    }
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
  const paths = Array.from(new Set(photoPaths.map((path) => path.trim()).filter(Boolean)));
  if (paths.length === 0) throw new InstallationPartnerError("PHOTO_REQUIRED");
  if (paths.length > PARTNER_COMPLETION_PHOTO_MAX) throw new InstallationPartnerError("PHOTO_COUNT_INVALID");
  if (!paths.every((path) => isPartnerPhotoPathForOrder(orderId, path))) {
    throw new InstallationPartnerError("PHOTO_PATH_INVALID");
  }
  if ((await findMissingPhotos(paths)).length > 0) throw new InstallationPartnerError("PHOTO_UPLOAD_INCOMPLETE");

  return prisma.$transaction(async (tx) => {
    const order = await loadPartnerOrderForUpdate(tx, orderId, partnerId);
    assertPartnerWorkable(order);

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
        },
        event: {
          eventType: "PARTNER_COMPLETION_SUBMITTED",
          actorType: "PARTNER",
          actorId: userId,
          metadata: { partnerId, photoCount: paths.length },
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

    const nextPartnerStatus = approve ? PARTNER_STATUSES.COMPLETED : PARTNER_STATUSES.SCHEDULED;
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
