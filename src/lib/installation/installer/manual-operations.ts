import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getInstallerContact } from "@/lib/installation/installer/source";
import { findBestMatchingInstallers } from "@/lib/installation/installer/matcher";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { buildInstallerAssignmentRequestSmsContent } from "@/lib/installation/notifications/sms-content";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import { inferDispatchRequirementFromMemo } from "@/lib/installation/orders/source/source-items";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";

type AdminOperationOptions = {
  adminId: string;
  now?: Date;
};

type ManualAssignmentOptions = AdminOperationOptions & {
  installerId: string;
  manualReason?: string | null;
  baseUrl?: string;
  tokenFactory?: () => string;
};

type CancelOrderOptions = AdminOperationOptions & {
  reason: string;
};

type ManualOrder = {
  id: string;
  status: string;
  hasOpenIssue?: boolean;
  source?: {
    memo: string | null;
  } | null;
  activeCustomerRequestId: string | null;
  activeAssignmentId: string | null;
  customerRequests?: Array<{
    installAddressEncrypted: string | null;
    installAddress1Encrypted: string | null;
    installDate: string | null;
    fallbackUsed?: boolean;
    status?: string;
  }>;
};

type ManualAssignment = {
  id: string;
  status: string;
  assignmentSource: string;
  selectionSnapshot?: unknown;
};

export async function createManualInstallerAssignment(
  orderId: string,
  {
    installerId,
    manualReason,
    adminId,
    now = new Date(),
    baseUrl,
    tokenFactory = createInstallerResponseToken,
  }: ManualAssignmentOptions,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        hasOpenIssue: true,
        source: {
          select: {
            memo: true,
          },
        },
        activeCustomerRequestId: true,
        activeAssignmentId: true,
        customerRequests: {
          where: {
            status: { in: ["SUBMITTED", "FALLBACK_USED"] },
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            installAddressEncrypted: true,
            installAddress1Encrypted: true,
            installDate: true,
            fallbackUsed: true,
            status: true,
          },
        },
      },
    });

    if (!order) {
      throw new InstallationManualOperationError("ORDER_NOT_FOUND");
    }

    const typedOrder = order as ManualOrder;
    if (!canCreateManualAssignmentFromOrder(typedOrder)) {
      throw new InstallationManualOperationError("ORDER_NOT_MANUAL_ASSIGNABLE");
    }
    const activeAssignment = await findActiveAssignmentForManualOperation(
      tx as never,
      typedOrder.activeAssignmentId,
    );
    if (activeAssignment && !canOverrideActiveAssignmentForManualAssignment(typedOrder, activeAssignment)) {
      throw new InstallationManualOperationError("ORDER_ALREADY_HAS_ACTIVE_ASSIGNMENT");
    }
    const installer = await getInstallerContact(installerId, tx as never);
    if (!installer?.phone) {
      throw new InstallationManualOperationError("INSTALLER_PHONE_NOT_FOUND");
    }
    validateManualInstallerEligibility(typedOrder, installer);
    const normalizedManualReason = manualReason?.trim() || null;
    const installAddress = decryptNullablePii(typedOrder.customerRequests?.[0]?.installAddressEncrypted);
    const regionMatched = isInstallerRegionMatched(installAddress, installer);
    if (!regionMatched && !normalizedManualReason) {
      throw new InstallationManualOperationError("MANUAL_ASSIGNMENT_REASON_REQUIRED");
    }

    const duplicateAssignment = await tx.installationInstallerAssignmentAttempt.findFirst({
      where: {
        installationOrderId: orderId,
        installerId,
      },
      select: { id: true },
    });
    if (duplicateAssignment) {
      throw new InstallationManualOperationError("DUPLICATE_INSTALLER_REQUEST");
    }

    if (activeAssignment) {
      await tx.installationInstallerAssignmentAttempt.update({
        where: { id: activeAssignment.id },
        data: {
          status: "ADMIN_MANUAL_OVERRIDDEN",
          cancelledByAdminId: adminId,
          selectionSnapshot: {
            ...toRecord(activeAssignment.selectionSnapshot),
            manualOverride: {
              adminId,
              reason: normalizedManualReason,
              overriddenAt: now.toISOString(),
            },
          },
        },
      });
    }

    const existingCount = await tx.installationInstallerAssignmentAttempt.count({
      where: { installationOrderId: orderId },
    });
    const token = tokenFactory();
    const assignment = await tx.installationInstallerAssignmentAttempt.create({
      data: {
        installationOrderId: orderId,
        customerRequestId: typedOrder.activeCustomerRequestId,
        installerId,
        assignmentNumber: existingCount + 1,
        assignmentSource: "MANUAL_DIRECT",
        matchTier: regionMatched ? "EXACT_DISTRICT" : "NOT_MATCHED",
        candidateRank: null,
        selectionSnapshot: {
          createdByAdminId: adminId,
          manualReason: normalizedManualReason,
          regionMatched,
        },
        createdByAdminId: adminId,
        installerTokenHash: hashInstallerToken(token),
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_INSTALLER_RESPONSE",
      },
    });
    const responseUrl = `${stripTrailingSlash(baseUrl ?? getSmsLinkBaseUrl())}/i/i/${encodeURIComponent(token)}`;
    const customerRequest = typedOrder.customerRequests?.[0] ?? null;
    const smsContent = buildInstallerAssignmentRequestSmsContent({
      addressMain: decryptNullablePii(customerRequest?.installAddress1Encrypted),
      installDate: customerRequest?.installDate ?? null,
      responseUrl,
    });
    const normalizedInstallerPhone = normalizePhone11(installer.phone);

    await tx.installationNotification.upsert({
      where: { idempotencyKey: `installer-assignment-request:${assignment.id}` },
      create: {
        installationOrderId: orderId,
        customerRequestId: typedOrder.activeCustomerRequestId,
        assignmentAttemptId: assignment.id,
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientType: "INSTALLER",
        recipientPhoneEncrypted: encryptNullablePii(normalizedInstallerPhone),
        recipientPhoneHash: hmacPii(normalizedInstallerPhone),
        smsTemplateKey: smsContent.templateKey,
        smsBody: smsContent.text,
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: `installer-assignment-request:${assignment.id}`,
      },
      update: {},
    });

    await transitionInstallationOrderStatus(
      orderId,
      INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
      {
        now,
        orderData: {
          activeAssignmentId: assignment.id,
          currentInstallerId: installerId,
        },
        event: {
          eventType: "MANUAL_ASSIGNMENT_CREATED",
          actorType: "ADMIN",
          actorId: adminId,
          metadata: {
            assignmentId: assignment.id,
            customerRequestId: typedOrder.activeCustomerRequestId,
            installerId,
            manualReason: normalizedManualReason,
            regionMatched,
          },
        },
      },
      tx as never,
    );

    return {
      assignmentId: assignment.id,
      status: INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
      activeAttempt: {
        id: assignment.id,
        assignmentType: "MANUAL_DIRECT",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    };
  });
}

function canCreateManualAssignmentFromOrder(
  order: Pick<ManualOrder, "status" | "hasOpenIssue" | "customerRequests">,
) {
  if (
    order.status === INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION ||
    order.status === INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW
  ) {
    return true;
  }

  return (
    (Boolean(order.hasOpenIssue) || hasFallbackCustomerRequest(order)) &&
    canSwitchToManualRequiredFromStatus(order.status)
  );
}

function hasFallbackCustomerRequest(order: Pick<ManualOrder, "customerRequests">) {
  return Boolean(
    order.customerRequests?.some(
      (request) => request.fallbackUsed || request.status === "FALLBACK_USED",
    ),
  );
}

function canOverrideActiveAssignmentForManualAssignment(
  order: Pick<ManualOrder, "status">,
  assignment: ManualAssignment,
) {
  return (
    order.status === INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW &&
    ["AUTO", "ADMIN_RETRY"].includes(assignment.assignmentSource) &&
    assignment.status === "WAITING_ADMIN_REVIEW"
  );
}

function validateManualInstallerEligibility(
  order: ManualOrder,
  installer: {
    active?: boolean;
    capabilities?: string[];
    aqaraAppCapability?: string;
  },
) {
  if (installer.active === false) {
    throw new InstallationManualOperationError("INSTALLER_NOT_ACTIVE");
  }

  const dispatchRequirement = inferDispatchRequirementFromMemo(order.source?.memo);
  const requiredCapabilities = dispatchRequirement.requiredCapabilities;
  const installerCapabilities = new Set(installer.capabilities ?? []);
  if (!requiredCapabilities.every((capability) => installerCapabilities.has(capability))) {
    throw new InstallationManualOperationError("INSTALLER_CAPABILITY_NOT_MATCHED");
  }

  const requiredAqaraCapability = dispatchRequirement.requiredAqaraAppCapability;
  if (!canSupportAqaraAppCapability(installer.aqaraAppCapability ?? "NONE", requiredAqaraCapability)) {
    throw new InstallationManualOperationError("INSTALLER_AQARA_CAPABILITY_NOT_MATCHED");
  }
}

const AQARA_APP_CAPABILITY_RANK: Record<string, number> = {
  NONE: 0,
  DOORLOCK_AND_APP: 1,
  DOORLOCK_AND_APP_AND_HUB: 2,
};

function canSupportAqaraAppCapability(candidate: string, required: string) {
  return (AQARA_APP_CAPABILITY_RANK[candidate] ?? 0) >= (AQARA_APP_CAPABILITY_RANK[required] ?? 0);
}

function isInstallerRegionMatched(
  installAddress: string | null,
  installer: {
    id?: string;
    name?: string;
    branch?: string | null;
    phone?: string;
    region?: string | null;
    coverage?: string | null;
    serviceAreas?: string[];
  },
) {
  if (!installAddress?.trim()) return true;

  return findBestMatchingInstallers(installAddress, [
    {
      businessNumber: installer.id ?? "",
      branchName: installer.branch?.trim() || installer.name || installer.id || "",
      phone: installer.phone ?? "",
      installationRegion: installer.region ?? "",
      possibleRegion:
        installer.serviceAreas && installer.serviceAreas.length > 0
          ? installer.serviceAreas.join(", ")
          : installer.coverage ?? "",
      impossibleRegion: "",
    },
  ]).length > 0;
}

export async function switchInstallationOrderToManualRequired(
  orderId: string,
  { adminId, reason, now = new Date() }: CancelOrderOptions,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        activeCustomerRequestId: true,
        activeAssignmentId: true,
      },
    });

    if (!order) {
      throw new InstallationManualOperationError("ORDER_NOT_FOUND");
    }

    const typedOrder = order as ManualOrder;
    if (!canSwitchToManualRequiredFromStatus(typedOrder.status)) {
      throw new InstallationManualOperationError("ORDER_NOT_MANUAL_SWITCHABLE");
    }

    const activeAssignment = await findActiveAssignmentForManualOperation(
      tx as never,
      typedOrder.activeAssignmentId,
    );
    const normalizedReason = reason.trim();
    if (
      activeAssignment &&
      ["AUTO", "ADMIN_RETRY"].includes(activeAssignment.assignmentSource) &&
      isActiveAssignmentStatus(activeAssignment.status)
    ) {
      await tx.installationInstallerAssignmentAttempt.update({
        where: { id: activeAssignment.id },
        data: {
          status: "ADMIN_MANUAL_OVERRIDDEN",
          cancelledByAdminId: adminId,
          selectionSnapshot: {
            ...toRecord(activeAssignment.selectionSnapshot),
            manualOverride: {
              adminId,
              reason: normalizedReason,
              overriddenAt: now.toISOString(),
            },
          },
        },
      });
    }

    const attentionStatus = getManualAttentionStatus(typedOrder.status);
    await createInstallationIssue(
      {
        installationOrderId: orderId,
        type: "INSTALLER_NOT_ASSIGNED",
        title: "관리자 수동 처리 필요",
        description: normalizedReason,
        metadata: {
          activeAssignmentId: typedOrder.activeAssignmentId,
          activeCustomerRequestId: typedOrder.activeCustomerRequestId,
        },
        now,
      },
      tx as never,
    );
    await tx.installationOrder.update({
      where: { id: orderId },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
      },
    });

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: orderId,
        fromStatus: attentionStatus,
        toStatus: attentionStatus,
        eventType: "ADMIN_SWITCHED_TO_MANUAL",
        actorType: "ADMIN",
        actorId: adminId,
        reason: normalizedReason,
        metadata: {
          activeAssignmentId: typedOrder.activeAssignmentId,
          activeCustomerRequestId: typedOrder.activeCustomerRequestId,
        },
        createdAt: now,
      },
    });
  });
}

function canSwitchToManualRequiredFromStatus(status: string) {
  const switchableStatuses: readonly string[] = [
    INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
    INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW,
    INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
  ];
  return switchableStatuses.includes(status);
}

function getManualAttentionStatus(status: string) {
  if (
    status === INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION ||
    status === INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW ||
    status === INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE
  ) {
    return status;
  }

  return INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION;
}

export async function completeInstallationOrder(
  orderId: string,
  { adminId, reason, now = new Date() }: CancelOrderOptions,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        activeCustomerRequestId: true,
        activeAssignmentId: true,
      },
    });

    if (!order) {
      throw new InstallationManualOperationError("ORDER_NOT_FOUND");
    }

    const typedOrder = order as ManualOrder;
    if (typedOrder.status !== INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED) {
      throw new InstallationManualOperationError("ORDER_NOT_COMPLETABLE");
    }
    const activeAssignment = await findActiveAssignmentForManualOperation(
      tx as never,
      typedOrder.activeAssignmentId,
    );
    if (activeAssignment && isCompletableAssignmentStatus(activeAssignment.status)) {
      await tx.installationInstallerAssignmentAttempt.update({
        where: { id: activeAssignment.id },
        data: {
          status: "ADMIN_COMPLETED",
        },
      });
    }

    const normalizedReason = reason.trim();
    await transitionInstallationOrderStatus(
      orderId,
      INSTALLATION_ORDER_STATUSES.COMPLETED,
      {
        now,
        orderData: {
          activeAssignmentId: null,
        },
        event: {
          eventType: "ADMIN_COMPLETED_ORDER",
          actorType: "ADMIN",
          actorId: adminId,
          reason: normalizedReason,
          metadata: {
            activeAssignmentId: typedOrder.activeAssignmentId,
            activeCustomerRequestId: typedOrder.activeCustomerRequestId,
          },
        },
      },
      tx as never,
    );
  });
}

export async function cancelInstallationOrder(
  orderId: string,
  { adminId, reason, now = new Date() }: CancelOrderOptions,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        activeCustomerRequestId: true,
        activeAssignmentId: true,
      },
    });

    if (!order) {
      throw new InstallationManualOperationError("ORDER_NOT_FOUND");
    }

    const typedOrder = order as ManualOrder;
    if (
      typedOrder.status === INSTALLATION_ORDER_STATUSES.COMPLETED ||
      typedOrder.status === INSTALLATION_ORDER_STATUSES.CANCELLED
    ) {
      throw new InstallationManualOperationError("ORDER_NOT_CANCELLABLE");
    }

    const activeAssignment = typedOrder.activeAssignmentId
      ? ((await tx.installationInstallerAssignmentAttempt.findUnique({
          where: { id: typedOrder.activeAssignmentId },
          select: {
            id: true,
            status: true,
            assignmentSource: true,
          },
        })) as ManualAssignment | null)
      : null;
    if (activeAssignment && shouldCancelActiveAssignment(activeAssignment.status)) {
      await tx.installationInstallerAssignmentAttempt.update({
        where: { id: activeAssignment.id },
        data: {
          status: "ADMIN_MANUAL_OVERRIDDEN",
          cancelledByAdminId: adminId,
        },
      });
    }

    if (typedOrder.activeCustomerRequestId) {
      await tx.installationCustomerRequest.update({
        where: { id: typedOrder.activeCustomerRequestId },
        data: { status: "CANCELLED" },
      });
    }

    const normalizedReason = reason.trim();
    await transitionInstallationOrderStatus(
      orderId,
      INSTALLATION_ORDER_STATUSES.CANCELLED,
      {
        now,
        orderData: {
          activeAssignmentId: null,
          currentInstallerId: null,
          cancelledAt: now,
          cancelReason: normalizedReason,
        },
        event: {
          eventType: "ADMIN_CANCELLED_ORDER",
          actorType: "ADMIN",
          actorId: adminId,
          reason: normalizedReason,
          metadata: {
            activeAssignmentId: typedOrder.activeAssignmentId,
            activeCustomerRequestId: typedOrder.activeCustomerRequestId,
          },
        },
      },
      tx as never,
    );
  });
}

function shouldCancelActiveAssignment(status: string) {
  return isActiveAssignmentStatus(status);
}

async function findActiveAssignmentForManualOperation(
  tx: {
    installationInstallerAssignmentAttempt: {
      findUnique: (args: unknown) => Promise<unknown>;
    };
  },
  activeAssignmentId: string | null,
) {
  if (!activeAssignmentId) return null;

  return (await tx.installationInstallerAssignmentAttempt.findUnique({
    where: { id: activeAssignmentId },
    select: {
      id: true,
      status: true,
      assignmentSource: true,
      selectionSnapshot: true,
    },
  })) as ManualAssignment | null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isActiveAssignmentStatus(status: string) {
  return ["WAITING_ADMIN_REVIEW", "WAITING_INSTALLER_RESPONSE", "SYSTEM_SMS_RETRY_PENDING"].includes(status);
}

function isCompletableAssignmentStatus(status: string) {
  return isActiveAssignmentStatus(status) || status === "INSTALLER_ACCEPTED";
}

function createInstallerResponseToken() {
  return randomBytes(16).toString("base64url");
}

function hashInstallerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export class InstallationManualOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationManualOperationError";
  }
}
