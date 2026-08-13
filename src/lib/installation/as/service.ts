import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizeNameForHash,
  normalizePhone11,
} from "@/lib/piiCrypto";
import { normalizePhone } from "@/lib/phone";
import { findBestMatchingInstallers } from "@/lib/installation/installer/matcher";
import { listDispatchCandidateInstallers } from "@/lib/installation/installer/source";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { getAsSymptomLabel, isValidAsSymptomCode } from "@/lib/installation/as/symptom-codes";

export class AsOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsOrderError";
  }
}

type AsStatus =
  | "WAITING_ASSIGNMENT"
  | "WAITING_INSTALLER_RESPONSE"
  | "INSTALLER_ASSIGNED"
  | "WAITING_HQ_REVIEW"
  | "COMPLETED"
  | "CANCELLED";

const ALLOWED_AS_TRANSITIONS: Record<AsStatus, AsStatus[]> = {
  WAITING_ASSIGNMENT: ["WAITING_INSTALLER_RESPONSE", "CANCELLED"],
  WAITING_INSTALLER_RESPONSE: ["INSTALLER_ASSIGNED", "WAITING_ASSIGNMENT", "CANCELLED"],
  INSTALLER_ASSIGNED: ["WAITING_HQ_REVIEW", "CANCELLED"],
  WAITING_HQ_REVIEW: ["COMPLETED", "INSTALLER_ASSIGNED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

type AsTx = Prisma.TransactionClient;

type AsTransitionContext = {
  now?: Date;
  orderData?: Record<string, unknown>;
  event: { eventType: string; actorType: string; actorId?: string | null; reason?: string | null; metadata?: Record<string, unknown> };
};

export async function transitionAsOrderStatus(
  tx: AsTx,
  asOrderId: string,
  nextStatus: AsStatus,
  context: AsTransitionContext,
) {
  const current = await tx.asOrder.findUnique({ where: { id: asOrderId }, select: { id: true, status: true } });
  if (!current) throw new AsOrderError("AS_ORDER_NOT_FOUND");

  const allowed = ALLOWED_AS_TRANSITIONS[current.status as AsStatus] ?? [];
  if (!allowed.includes(nextStatus)) throw new AsOrderError("INVALID_AS_STATUS_TRANSITION");

  const now = context.now ?? new Date();
  await tx.asOrder.update({
    where: { id: asOrderId },
    data: { ...(context.orderData ?? {}), status: nextStatus, statusChangedAt: now },
  });
  await tx.asOrderStatusEvent.create({
    data: {
      asOrderId,
      fromStatus: current.status,
      toStatus: nextStatus,
      eventType: context.event.eventType,
      actorType: context.event.actorType,
      actorId: context.event.actorId ?? null,
      reason: context.event.reason ?? null,
      metadata: (context.event.metadata ?? {}) as Prisma.InputJsonValue,
      createdAt: now,
    },
  });
}

// --- Original-installer history lookup ("who installed it repairs it") ---
export async function findOriginalInstallerForAs(input: {
  orderNo?: string | null;
  phone?: string | null;
}): Promise<{ installationOrderId: string; installerId: string; installerName: string } | null> {
  const orderNo = input.orderNo?.trim();
  const phone = input.phone ? normalizePhone(input.phone) : "";

  const or: Array<Record<string, unknown>> = [];
  if (orderNo) {
    or.push(
      { source: { is: { sourceKey: { contains: orderNo, mode: "insensitive" } } } },
      { source: { is: { orderNumbers: { contains: orderNo, mode: "insensitive" } } } },
    );
  }
  if (phone.length >= 10) {
    let phoneHash: string | null = null;
    try {
      phoneHash = hmacPii(normalizePhone11(phone));
    } catch {
      phoneHash = null;
    }
    if (phoneHash) {
      or.push(
        { source: { is: { phoneHash } } },
        { customerRequests: { some: { customerPhoneHash: phoneHash } } },
      );
    }
  }
  if (or.length === 0) return null;

  const order = await prisma.installationOrder.findFirst({
    where: { OR: or, currentInstallerId: { not: null } },
    orderBy: { statusChangedAt: "desc" },
    select: { id: true, currentInstaller: { select: { id: true, name: true } } },
  });
  if (!order?.currentInstaller) return null;
  return {
    installationOrderId: order.id,
    installerId: order.currentInstaller.id,
    installerName: order.currentInstaller.name,
  };
}

export type AsInstallerRecommendation = {
  installerId: string;
  name: string;
  phone: string;
  region: string | null;
  matchTier: string | null;
};

export async function recommendInstallersForAs(address: string): Promise<AsInstallerRecommendation[]> {
  if (!address.trim()) return [];
  const candidates = await listDispatchCandidateInstallers();
  const matched = findBestMatchingInstallers(address, candidates);
  return matched.map((m) => ({
    installerId: m.businessNumber,
    name: m.branchName,
    phone: m.phone,
    region: m.installationRegion ?? null,
    matchTier: m.matchTier ?? null,
  }));
}

// --- Create ---
export async function createAsOrder(input: {
  adminId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  symptomCode: string;
  symptomDetail?: string | null;
  orderNo?: string | null;
  originalInstallationOrderId?: string | null;
  memo?: string | null;
  assignInstallerId?: string | null;
}): Promise<{ id: string }> {
  if (!isValidAsSymptomCode(input.symptomCode)) throw new AsOrderError("INVALID_SYMPTOM_CODE");

  const phone = input.customerPhone ? normalizePhone(input.customerPhone) : "";
  let phoneHash: string | null = null;
  if (phone.length >= 10) {
    try {
      phoneHash = hmacPii(normalizePhone11(phone));
    } catch {
      phoneHash = null;
    }
  }
  const name = input.customerName?.trim() || null;

  const created = await prisma.asOrder.create({
    data: {
      status: "WAITING_ASSIGNMENT",
      customerNameEncrypted: encryptNullablePii(name),
      customerNameHash: name ? hmacPii(normalizeNameForHash(name)) : null,
      customerPhoneEncrypted: encryptNullablePii(phone || null),
      customerPhoneHash: phoneHash,
      addressEncrypted: encryptNullablePii(input.address?.trim() || null),
      symptomCode: input.symptomCode,
      symptomDetail: input.symptomDetail?.trim() || null,
      orderNo: input.orderNo?.trim() || null,
      originalInstallationOrderId: input.originalInstallationOrderId?.trim() || null,
      memo: input.memo?.trim() || null,
      createdByAdminId: input.adminId,
    },
    select: { id: true },
  });

  if (input.assignInstallerId) {
    await assignAsOrderInstaller({
      adminId: input.adminId,
      asOrderId: created.id,
      installerId: input.assignInstallerId,
    });
  }

  return created;
}

// --- Assign / reassign to an installer ---
export async function assignAsOrderInstaller(input: {
  adminId: string;
  asOrderId: string;
  installerId: string;
}): Promise<void> {
  const installer = await prisma.installer.findUnique({
    where: { id: input.installerId },
    select: { id: true, active: true },
  });
  if (!installer || !installer.active) throw new AsOrderError("INSTALLER_NOT_AVAILABLE");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const order = await tx.asOrder.findUnique({ where: { id: input.asOrderId }, select: { status: true } });
    if (!order) throw new AsOrderError("AS_ORDER_NOT_FOUND");
    if (order.status !== "WAITING_ASSIGNMENT") throw new AsOrderError("AS_ORDER_NOT_ASSIGNABLE");

    await transitionAsOrderStatus(tx, input.asOrderId, "WAITING_INSTALLER_RESPONSE", {
      now,
      orderData: {
        currentInstallerId: input.installerId,
        assignedAt: now,
        respondedAt: null,
        installerRejectReason: null,
      },
      event: { eventType: "ADMIN_ASSIGNED_AS", actorType: "ADMIN", actorId: input.adminId },
    });
  });

  // Best-effort push (SMS fallback could be added later).
  try {
    await sendAssignmentPushToInstaller(input.installerId, {
      title: "새 A/S 배정",
      body: "앱에서 확인하고 수락/거절해 주세요.",
    });
  } catch (error) {
    console.error("[as/assign-push]", error);
  }
}

export async function cancelAsOrder(input: { adminId: string; asOrderId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new AsOrderError("CANCEL_REASON_REQUIRED");
  await prisma.$transaction(async (tx) => {
    await transitionAsOrderStatus(tx, input.asOrderId, "CANCELLED", {
      orderData: { currentInstallerId: null },
      event: { eventType: "ADMIN_CANCELLED_AS", actorType: "ADMIN", actorId: input.adminId, reason },
    });
  });
}

// --- Admin list/detail ---
export type AsOrderListItem = {
  id: string;
  status: string;
  symptomCode: string;
  symptomLabel: string;
  customerName: string | null;
  address: string | null;
  installerName: string | null;
  createdAt: string;
};

export async function listAsOrders(input?: { status?: string }): Promise<AsOrderListItem[]> {
  const rows = await prisma.asOrder.findMany({
    where: input?.status ? { status: input.status as AsStatus } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      symptomCode: true,
      customerNameEncrypted: true,
      addressEncrypted: true,
      createdAt: true,
      currentInstaller: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    symptomCode: r.symptomCode,
    symptomLabel: getAsSymptomLabel(r.symptomCode),
    customerName: decryptNullablePii(r.customerNameEncrypted),
    address: decryptNullablePii(r.addressEncrypted),
    installerName: r.currentInstaller?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
