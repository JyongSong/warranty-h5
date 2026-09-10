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
import { createAsSettlementSnapshot } from "@/lib/installation/settlement/snapshot";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { getCompletionPhotoSignedUrls, type CompletionPhoto } from "@/lib/installer/storage";
import { sendSms } from "@/lib/sms";
import { getAsSymptomLabel, isValidAsSymptomCode } from "@/lib/installation/as/symptom-codes";
import { normalizeAddressKey } from "@/lib/backoffice/as-history-import";

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
//
// 두 곳을 본다. 새 배정 시스템(installation_orders)은 기사까지 정확히 알지만
// 가동 직후라 이력이 거의 없고, ERP 사본(as_install_history)은 2026년치가 다
// 있지만 담당기사가 37%만 채워져 있다. 그래서 결과는 "기사 1명"이 아니라
// 이력 카드 목록이다 — 대부분의 건은 시공 "업체"까지만 알 수 있고, A/S 배정은
// 어차피 담당자가 손으로 하므로 그 정도로 충분하다.
export type AsOriginalInstallRecord = {
  source: "DISPATCH" | "ERP_HISTORY";
  /** 새 배정 시스템 건만. A/S 주문에 원 설치건을 걸어 두는 데 쓴다. */
  installationOrderId: string | null;
  installDate: string | null;
  itemName: string | null;
  /** ERP 거래처명 원문. 매칭이 안 돼도 담당자가 보고 판단할 수 있어야 한다. */
  vendorName: string | null;
  /** 기사가 1명으로 확정된 건만. 업체까지만 아는 건은 null. */
  installerId: string | null;
  installerName: string | null;
  branch: string | null;
  /** 그 업체에 속한 지정 가능한 기사들. 업체만 아는 건의 지정 후보가 된다. */
  branchInstallers: Array<{ id: string; name: string; phone: string }>;
  serviceFee: number | null;
  customerName: string | null;
  address: string | null;
  erpStatus: string | null;
  /** 어느 키로 찾혔는지. 담당자가 신뢰도를 판단하는 근거. */
  matchedOn: "ORDER_NO" | "PHONE" | "ADDRESS" | "CUSTOMER_NAME";
};

const AS_HISTORY_LOOKUP_LIMIT = 5;
// 반품/취소 건은 설치가 안 됐다는 뜻이라 A/S 추적에서 뺀다.
const AS_HISTORY_EXCLUDED_STATUSES = ["반품/취소"];

export async function findOriginalInstallsForAs(input: {
  orderNo?: string | null;
  phone?: string | null;
  customerName?: string | null;
  address?: string | null;
}): Promise<AsOriginalInstallRecord[]> {
  const dispatch = await findDispatchInstallForAs(input);
  const history = await findErpHistoryForAs(input);

  // 새 배정 시스템 건이 항상 먼저다 — 기사까지 확실하다.
  const records = [...dispatch, ...history].slice(0, AS_HISTORY_LOOKUP_LIMIT);
  return attachBranchInstallers(records);
}

async function findDispatchInstallForAs(input: {
  orderNo?: string | null;
  phone?: string | null;
}): Promise<AsOriginalInstallRecord[]> {
  const orderNo = input.orderNo?.trim();
  const phone = input.phone ? normalizePhone(input.phone) : "";

  const or: Array<Record<string, unknown>> = [];
  const matchedOnByOrderNo = Boolean(orderNo);
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
        // CJ 건은 주문자와 설치 받는 분의 번호가 다를 수 있다. 어느 쪽으로
        // A/S 를 접수해도 원래 설치 건을 찾아야 한다.
        { customerRequests: { some: { ordererPhoneHash: phoneHash } } },
      );
    }
  }
  if (or.length === 0) return [];

  const orders = await prisma.installationOrder.findMany({
    where: { OR: or, currentInstallerId: { not: null } },
    orderBy: { statusChangedAt: "desc" },
    take: 3,
    select: {
      id: true,
      currentInstaller: { select: { id: true, name: true, branch: true } },
      source: { select: { customerNameEncrypted: true, addressEncrypted: true } },
      completion: { select: { installEndAt: true } },
    },
  });

  return orders
    .filter((order) => order.currentInstaller)
    .map((order) => ({
      source: "DISPATCH" as const,
      installationOrderId: order.id,
      installDate: order.completion?.installEndAt.toISOString().slice(0, 10) ?? null,
      itemName: null,
      vendorName: order.currentInstaller?.branch ?? null,
      installerId: order.currentInstaller!.id,
      installerName: order.currentInstaller!.name,
      branch: order.currentInstaller?.branch ?? null,
      branchInstallers: [],
      serviceFee: null,
      customerName: decryptNullablePii(order.source?.customerNameEncrypted ?? null),
      address: decryptNullablePii(order.source?.addressEncrypted ?? null),
      erpStatus: null,
      matchedOn: matchedOnByOrderNo ? ("ORDER_NO" as const) : ("PHONE" as const),
    }));
}

async function findErpHistoryForAs(input: {
  phone?: string | null;
  customerName?: string | null;
  address?: string | null;
}): Promise<AsOriginalInstallRecord[]> {
  // 정확한 키부터 차례로 본다. 안심번호(050X)로 접수된 42% 는 전화가 영영
  // 안 맞으므로 주소가 사실상 유일한 키고, 주소도 없으면 이름으로 훑는다.
  const attempts: Array<{ matchedOn: AsOriginalInstallRecord["matchedOn"]; where: Prisma.AsInstallHistoryWhereInput }> = [];

  const phone = input.phone ? normalizePhone(input.phone) : "";
  if (phone.length >= 10) {
    const hashes = [safeHash(phone)];
    try {
      hashes.push(safeHash(normalizePhone11(phone)));
    } catch {
      // 11자리로 정규화할 수 없는 번호는 원문 hash 만 본다.
    }
    const phoneHashes = hashes.filter((h): h is string => Boolean(h));
    if (phoneHashes.length > 0) {
      attempts.push({ matchedOn: "PHONE", where: { customerPhoneHash: { in: phoneHashes } } });
    }
  }

  const addressKey = input.address ? normalizeAddressKey(input.address) : null;
  const addressHash = addressKey ? safeHash(addressKey) : null;
  if (addressHash) {
    attempts.push({ matchedOn: "ADDRESS", where: { addressHash } });
  }

  const name = input.customerName?.trim();
  const nameHash = name ? safeHash(normalizeNameForHash(name)) : null;
  if (nameHash) {
    attempts.push({ matchedOn: "CUSTOMER_NAME", where: { customerNameHash: nameHash } });
  }

  const found = new Map<string, AsOriginalInstallRecord>();
  for (const attempt of attempts) {
    if (found.size >= AS_HISTORY_LOOKUP_LIMIT) break;

    const rows = await prisma.asInstallHistory.findMany({
      where: { ...attempt.where, erpStatus: { notIn: AS_HISTORY_EXCLUDED_STATUSES } },
      orderBy: [{ installDate: "desc" }, { createdAt: "desc" }],
      take: AS_HISTORY_LOOKUP_LIMIT,
      select: {
        id: true,
        installDate: true,
        itemName: true,
        vendorName: true,
        installerNameRaw: true,
        matchedInstallerId: true,
        matchedBranch: true,
        serviceFee: true,
        erpStatus: true,
        customerNameEncrypted: true,
        addressEncrypted: true,
        matchedInstaller: { select: { id: true, name: true } },
      },
    });

    for (const row of rows) {
      if (found.has(row.id)) continue;
      found.set(row.id, {
        source: "ERP_HISTORY",
        installationOrderId: null,
        installDate: row.installDate,
        itemName: row.itemName,
        vendorName: row.vendorName,
        installerId: row.matchedInstaller?.id ?? null,
        // 매칭이 안 된 기사도 원문은 보여 준다. 담당자가 아는 이름일 수 있다.
        installerName: row.matchedInstaller?.name ?? row.installerNameRaw,
        branch: row.matchedBranch,
        branchInstallers: [],
        serviceFee: row.serviceFee,
        customerName: decryptNullablePii(row.customerNameEncrypted),
        address: decryptNullablePii(row.addressEncrypted),
        erpStatus: row.erpStatus,
        matchedOn: attempt.matchedOn,
      });
    }
  }

  return [...found.values()].slice(0, AS_HISTORY_LOOKUP_LIMIT);
}

/**
 * 업체까지만 아는 건에 그 업체의 현직 기사를 붙인다. 담당자가 카드에서 바로
 * 고를 수 있어야 "누가 깔았나"가 실제 배정으로 이어진다.
 */
async function attachBranchInstallers(
  records: AsOriginalInstallRecord[],
): Promise<AsOriginalInstallRecord[]> {
  const branches = [...new Set(records.map((r) => r.branch).filter((b): b is string => Boolean(b)))];
  if (branches.length === 0) return records;

  const installers = await prisma.installer.findMany({
    where: { branch: { in: branches }, active: true },
    select: { id: true, name: true, phone: true, branch: true },
    orderBy: { name: "asc" },
  });

  const byBranch = new Map<string, Array<{ id: string; name: string; phone: string }>>();
  for (const installer of installers) {
    if (!installer.branch) continue;
    const bucket = byBranch.get(installer.branch) ?? [];
    bucket.push({ id: installer.id, name: installer.name, phone: installer.phone });
    byBranch.set(installer.branch, bucket);
  }

  return records.map((record) => ({
    ...record,
    branchInstallers: record.branch ? (byBranch.get(record.branch) ?? []) : [],
  }));
}

function safeHash(value: string): string | null {
  try {
    return hmacPii(value);
  } catch {
    return null;
  }
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

// Installer accept/reject. Reject routes back to admin (WAITING_ASSIGNMENT) and
// clears the installer — NO auto-reassign (PRD §7.3, M3).
export async function respondToAsAssignmentAsInstaller(input: {
  installerId: string;
  asOrderId: string;
  response: "ACCEPT" | "REJECT";
  rejectReason?: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const order = await tx.asOrder.findUnique({
      where: { id: input.asOrderId },
      select: { status: true, currentInstallerId: true },
    });
    if (!order) throw new AsOrderError("AS_ORDER_NOT_FOUND");
    if (order.currentInstallerId !== input.installerId) throw new AsOrderError("NOT_YOUR_AS_ORDER");
    if (order.status !== "WAITING_INSTALLER_RESPONSE") throw new AsOrderError("AS_ORDER_NOT_RESPONDABLE");

    if (input.response === "ACCEPT") {
      await transitionAsOrderStatus(tx, input.asOrderId, "INSTALLER_ASSIGNED", {
        now,
        orderData: { respondedAt: now },
        event: { eventType: "INSTALLER_ACCEPTED_AS", actorType: "INSTALLER", actorId: input.installerId },
      });
    } else {
      const reason = input.rejectReason?.trim() || null;
      await transitionAsOrderStatus(tx, input.asOrderId, "WAITING_ASSIGNMENT", {
        now,
        orderData: { currentInstallerId: null, respondedAt: now, installerRejectReason: reason },
        event: {
          eventType: "INSTALLER_REJECTED_AS",
          actorType: "INSTALLER",
          actorId: input.installerId,
          reason,
        },
      });
    }
  });
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

// --- Installer completion (처리 details + 용역비 + optional photos) ---
export async function submitAsCompletion(input: {
  installerId: string;
  asOrderId: string;
  resolutionDetail: string;
  serviceFee: number | null;
  photoPaths: string[];
}): Promise<void> {
  const resolutionDetail = input.resolutionDetail.trim();
  if (!resolutionDetail) throw new AsOrderError("RESOLUTION_DETAIL_REQUIRED");
  if (input.photoPaths.length > 4) throw new AsOrderError("PHOTO_COUNT_INVALID");

  await prisma.$transaction(async (tx) => {
    const order = await tx.asOrder.findUnique({
      where: { id: input.asOrderId },
      select: { status: true, currentInstallerId: true },
    });
    if (!order || order.currentInstallerId !== input.installerId) throw new AsOrderError("NOT_YOUR_AS_ORDER");
    if (order.status !== "INSTALLER_ASSIGNED") throw new AsOrderError("AS_ORDER_NOT_SUBMITTABLE");

    await transitionAsOrderStatus(tx, input.asOrderId, "WAITING_HQ_REVIEW", {
      orderData: {
        resolutionDetail,
        serviceFee: input.serviceFee,
        completionPhotoPaths: input.photoPaths,
        submittedAt: new Date(),
        reviewStatus: "PENDING",
        reviewedByAdminId: null,
        reviewedAt: null,
        hqRejectionReason: null,
      },
      event: { eventType: "INSTALLER_SUBMITTED_AS_COMPLETION", actorType: "INSTALLER", actorId: input.installerId },
    });
  });
}

export async function approveAsCompletion(input: { adminId: string; asOrderId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.asOrder.findUnique({ where: { id: input.asOrderId }, select: { status: true } });
    if (!order) throw new AsOrderError("AS_ORDER_NOT_FOUND");
    if (order.status !== "WAITING_HQ_REVIEW") throw new AsOrderError("AS_ORDER_NOT_IN_REVIEW");

    await transitionAsOrderStatus(tx, input.asOrderId, "COMPLETED", {
      orderData: {
        reviewStatus: "APPROVED",
        reviewedByAdminId: input.adminId,
        reviewedAt: new Date(),
        hqRejectionReason: null,
      },
      event: { eventType: "ADMIN_APPROVED_AS_COMPLETION", actorType: "ADMIN", actorId: input.adminId },
    });

    // §8.5 M1: freeze the A/S settlement snapshot (용역비) at approval time.
    await createAsSettlementSnapshot(tx, { asOrderId: input.asOrderId, adminId: input.adminId });
  });
}

export async function rejectAsCompletion(input: {
  adminId: string;
  asOrderId: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new AsOrderError("REJECTION_REASON_REQUIRED");

  const installerId = await prisma.$transaction(async (tx) => {
    const order = await tx.asOrder.findUnique({
      where: { id: input.asOrderId },
      select: { status: true, currentInstallerId: true },
    });
    if (!order) throw new AsOrderError("AS_ORDER_NOT_FOUND");
    if (order.status !== "WAITING_HQ_REVIEW") throw new AsOrderError("AS_ORDER_NOT_IN_REVIEW");

    await transitionAsOrderStatus(tx, input.asOrderId, "INSTALLER_ASSIGNED", {
      orderData: {
        reviewStatus: "REJECTED",
        reviewedByAdminId: input.adminId,
        reviewedAt: new Date(),
        hqRejectionReason: reason,
      },
      event: { eventType: "ADMIN_REJECTED_AS_COMPLETION", actorType: "ADMIN", actorId: input.adminId, reason },
    });
    return order.currentInstallerId;
  });

  if (installerId) {
    const shortReason = reason.length > 40 ? `${reason.slice(0, 40)}…` : reason;
    try {
      await sendAssignmentPushToInstaller(installerId, {
        title: "A/S 처리가 반려되었습니다",
        body: `사유: ${shortReason}`,
      });
    } catch (error) {
      console.error("[as/reject-push]", error);
    }
    try {
      const installer = await prisma.installer.findUnique({ where: { id: installerId }, select: { phone: true } });
      if (installer?.phone) {
        await sendSms(
          installer.phone,
          `[Aqara 기사] A/S 처리가 반려되었습니다.\n사유: ${shortReason}\n앱에서 다시 등록해 주세요.`,
        );
      }
    } catch (error) {
      console.error("[as/reject-sms]", error);
    }
  }
}

export type AsAdminDetail = {
  id: string;
  status: string;
  symptomCode: string;
  symptomLabel: string;
  symptomDetail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  orderNo: string | null;
  memo: string | null;
  installerName: string | null;
  installerRejectReason: string | null;
  resolutionDetail: string | null;
  serviceFee: number | null;
  reviewStatus: string | null;
  hqRejectionReason: string | null;
  photos: CompletionPhoto[];
  createdAt: string;
};

export async function getAsOrderForAdmin(asOrderId: string): Promise<AsAdminDetail | null> {
  const o = await prisma.asOrder.findUnique({
    where: { id: asOrderId },
    select: {
      id: true,
      status: true,
      symptomCode: true,
      symptomDetail: true,
      customerNameEncrypted: true,
      customerPhoneEncrypted: true,
      addressEncrypted: true,
      orderNo: true,
      memo: true,
      installerRejectReason: true,
      resolutionDetail: true,
      serviceFee: true,
      reviewStatus: true,
      hqRejectionReason: true,
      completionPhotoPaths: true,
      createdAt: true,
      currentInstaller: { select: { name: true } },
    },
  });
  if (!o) return null;

  return {
    id: o.id,
    status: o.status,
    symptomCode: o.symptomCode,
    symptomLabel: getAsSymptomLabel(o.symptomCode),
    symptomDetail: o.symptomDetail,
    customerName: decryptNullablePii(o.customerNameEncrypted),
    customerPhone: decryptNullablePii(o.customerPhoneEncrypted),
    address: decryptNullablePii(o.addressEncrypted),
    orderNo: o.orderNo,
    memo: o.memo,
    installerName: o.currentInstaller?.name ?? null,
    installerRejectReason: o.installerRejectReason,
    resolutionDetail: o.resolutionDetail,
    serviceFee: o.serviceFee,
    reviewStatus: o.reviewStatus,
    hqRejectionReason: o.hqRejectionReason,
    photos: await getCompletionPhotoSignedUrls(o.completionPhotoPaths),
    createdAt: o.createdAt.toISOString(),
  };
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
  /** 기사가 등록한 용역비. A/S 정산액은 이 금액 그대로다. */
  serviceFee: number | null;
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
      serviceFee: true,
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
    serviceFee: r.serviceFee,
    createdAt: r.createdAt.toISOString(),
  }));
}

// Cost-saving notification: A/S assignment sends only an FCM push up front; if
// the installer still hasn't responded after 5h, send ONE SMS reminder (marked
// so it never repeats). Run from the dispatcher cron, gated by the SMS window.
const AS_SMS_REMINDER_AFTER_MS = 5 * 60 * 60 * 1000;

export async function remindUnrespondedAsAssignments(input?: {
  now?: Date;
  limit?: number;
}): Promise<{ remindedCount: number }> {
  const now = input?.now ?? new Date();
  const threshold = new Date(now.getTime() - AS_SMS_REMINDER_AFTER_MS);

  const orders = await prisma.asOrder.findMany({
    where: {
      status: "WAITING_INSTALLER_RESPONSE",
      installerSmsRemindedAt: null,
      currentInstallerId: { not: null },
      assignedAt: { lt: threshold },
    },
    orderBy: { assignedAt: "asc" },
    take: input?.limit ?? 50,
    select: { id: true, currentInstaller: { select: { phone: true } } },
  });

  let remindedCount = 0;
  for (const order of orders) {
    const phone = order.currentInstaller?.phone ?? null;
    try {
      if (phone) {
        await sendSms(phone, "[Aqara 기사] 새 A/S가 배정되었습니다. 앱에서 확인하고 수락/거절해 주세요.");
      }
      // Mark even when there is no phone, so it isn't rescanned every tick.
      await prisma.asOrder.update({
        where: { id: order.id },
        data: { installerSmsRemindedAt: now },
      });
      remindedCount += 1;
    } catch (error) {
      console.error("[as/sms-reminder]", error);
    }
  }
  return { remindedCount };
}
