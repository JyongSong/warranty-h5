import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  findBestMatchingInstallers,
} from "@/lib/installation/installer/matcher";
import {
  getInstallerContact,
  listDispatchCandidateInstallers,
  type DispatchCandidateInstaller,
} from "@/lib/installation/installer/source";
import { inferDispatchRequirementFromMemo } from "@/lib/installation/orders/source/source-items";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { buildInstallerAssignmentRequestSmsContent } from "@/lib/installation/notifications/sms-content";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";

type DispatchReadyInstallationOrdersOptions = {
  now?: Date;
  limit?: number;
  dispatchWindowDays?: number;
  orderId?: string;
  baseUrl?: string;
  tokenFactory?: () => string;
};

type AdminRetryInstallationOrderOptions = {
  adminId: string;
  reason: string;
  now?: Date;
  baseUrl?: string;
  tokenFactory?: () => string;
};

type ApproveInstallationAssignmentOptions = {
  adminId: string;
  now?: Date;
  baseUrl?: string;
  tokenFactory?: () => string;
};

type AssignmentDispatchResult = {
  assignmentId: string | null;
  status:
    | "READY_FOR_CANDIDATE_SELECTION"
    | "WAITING_ADMIN_REVIEW"
    | "WAITING_INSTALLER_RESPONSE";
  activeAttempt: {
    id: string;
    assignmentType: string;
    assignmentStatus: "WAITING_ADMIN_REVIEW" | "WAITING_INSTALLER_RESPONSE" | "SYSTEM_SMS_RETRY_PENDING";
    smsRetryPending: boolean;
  } | null;
  reasonCode?: string;
};

type ReadyOrder = {
  id: string;
  activeCustomerRequestId: string | null;
  source: {
    memo: string | null;
    addressEncrypted: string | null;
  } | null;
  customerRequests: Array<{
    id: string;
    installAddressEncrypted: string | null;
    installAddress1Encrypted: string | null;
    installDate: string | null;
  }>;
};

type AdminRetryOrder = ReadyOrder & {
  status: string;
  hasOpenIssue: boolean;
  activeAssignmentId: string | null;
};

type AssignmentCreationOptions = {
  now: Date;
  baseUrl?: string;
  tokenFactory: () => string;
  assignmentSource: "AUTO" | "ADMIN_RETRY";
  currentOrderStatus?: AssignmentDispatchResult["status"];
  eventType: string;
  actorType: "SYSTEM" | "ADMIN";
  actorId?: string | null;
  reason?: string | null;
  candidateRun?: CandidateRunInput;
  smsContext?: {
    addressMain?: string | null;
    installDate?: string | null;
  };
};

type CandidateRunInput = {
  customerRequestId: string | null;
  assignmentSource: "AUTO" | "ADMIN_RETRY";
  reasonCode: string | null;
  requiredCapabilities: string[];
  requiredAqaraAppCapability: string;
  installAddress: string | null;
  installDate: string | null;
  candidates: DispatchCandidateInstaller[];
  selectedInstallerId?: string | null;
};

export type DispatchReadyInstallationOrdersResult = {
  dispatchedCount: number;
  skippedCount: number;
};

export async function dispatchReadyInstallationOrders({
  now = new Date(),
  limit = 25,
  dispatchWindowDays = 10,
  orderId,
  baseUrl,
  tokenFactory = createInstallerResponseToken,
}: DispatchReadyInstallationOrdersOptions = {}): Promise<DispatchReadyInstallationOrdersResult> {
  const dispatchWindowEnd = toKstDateString(addDays(now, dispatchWindowDays));
  const orders = await prisma.installationOrder.findMany({
    where: {
      ...(orderId ? { id: orderId } : {}),
      status: INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
      activeAssignmentId: null,
      customerRequests: {
        some: {
          status: { in: ["SUBMITTED", "FALLBACK_USED"] },
          installDate: {
            lte: dispatchWindowEnd,
          },
        },
      },
    },
    orderBy: { statusChangedAt: "asc" },
    take: limit,
    select: {
      id: true,
      activeCustomerRequestId: true,
      source: {
        select: {
          memo: true,
          addressEncrypted: true,
        },
      },
      customerRequests: {
        where: {
          status: { in: ["SUBMITTED", "FALLBACK_USED"] },
          installDate: {
            lte: dispatchWindowEnd,
          },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          installAddressEncrypted: true,
          installAddress1Encrypted: true,
          installDate: true,
        },
      },
    },
  });

  if (orderId && orders.length === 0) {
    const skipped = await recordSkippedAutoRequestCandidateRun(orderId, now);
    if (skipped) {
      return { dispatchedCount: 0, skippedCount: 1 };
    }
  }

  let dispatchedCount = 0;
  let skippedCount = 0;
  for (const order of orders as ReadyOrder[]) {
    const customerRequest = getActiveCustomerRequest(order);
    const installAddress = decryptNullablePii(customerRequest?.installAddressEncrypted);
    if (!installAddress) {
      const productRequirement = getDispatchRequirement(order);
      await markNoCandidateFound(order.id, customerRequest?.id ?? null, "설치 주소가 없어 후보를 선정할 수 없습니다.", now, {
        customerRequestId: customerRequest?.id ?? null,
        assignmentSource: "AUTO",
        reasonCode: "UNPARSABLE_INSTALL_ADDRESS",
        requiredCapabilities: productRequirement.requiredCapabilities,
        requiredAqaraAppCapability: productRequirement.requiredAqaraAppCapability,
        installAddress,
        installDate: customerRequest?.installDate ?? null,
        candidates: [],
      });
      skippedCount += 1;
      continue;
    }

    const productRequirement = getDispatchRequirement(order);
    const addressMain =
      decryptNullablePii(customerRequest.installAddress1Encrypted) ??
      decryptNullablePii(order.source?.addressEncrypted);
    if (!productRequirement.itemCode) {
      await markUnmappedProductRequirement(order.id, customerRequest.id, now, {
        customerRequestId: customerRequest.id,
        assignmentSource: "AUTO",
        reasonCode: "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
        requiredCapabilities: [],
        requiredAqaraAppCapability: productRequirement.requiredAqaraAppCapability,
        installAddress,
        installDate: customerRequest.installDate,
        candidates: [],
      });
      skippedCount += 1;
      continue;
    }

    const requiredCapabilities = productRequirement.requiredCapabilities;
    const requiredAqaraAppCapability = productRequirement.requiredAqaraAppCapability;
    const installers = await listDispatchCandidateInstallers({
      requiredCapabilities,
      requiredAqaraAppCapability,
    });
    const candidates = findBestMatchingInstallers(installAddress, installers);
    const candidate = candidates[0];
    if (!candidate) {
      await markNoCandidateFound(order.id, customerRequest.id, "조건에 맞는 후보 기사가 없습니다.", now, {
        customerRequestId: customerRequest.id,
        assignmentSource: "AUTO",
        reasonCode: installers.length === 0 ? "NO_CAPABILITY_MATCH" : "NO_REGION_MATCH",
        requiredCapabilities,
        requiredAqaraAppCapability,
        installAddress,
        installDate: customerRequest.installDate,
        candidates,
      });
      skippedCount += 1;
      continue;
    }

    const result = await createWaitingInstallerResponseAssignment(order.id, customerRequest.id, candidate, {
      now,
      baseUrl,
      tokenFactory,
      assignmentSource: "AUTO",
      eventType: "AUTO_CANDIDATE_SELECTED",
      actorType: "SYSTEM",
      candidateRun: {
        customerRequestId: customerRequest.id,
        assignmentSource: "AUTO",
        reasonCode: null,
        requiredCapabilities,
        requiredAqaraAppCapability,
        installAddress,
        installDate: customerRequest.installDate,
        candidates,
        selectedInstallerId: candidate.businessNumber,
      },
      smsContext: {
        addressMain,
        installDate: customerRequest.installDate,
      },
    });
    if (result.assignmentId) {
      dispatchedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return { dispatchedCount, skippedCount };
}

export async function retryInstallationOrderAssignmentByAdmin(
  orderId: string,
  {
    adminId,
    reason,
    now = new Date(),
    baseUrl,
    tokenFactory = createInstallerResponseToken,
  }: AdminRetryInstallationOrderOptions,
) {
  const order = (await prisma.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      hasOpenIssue: true,
      activeCustomerRequestId: true,
      activeAssignmentId: true,
      source: {
        select: {
          memo: true,
          addressEncrypted: true,
        },
      },
      customerRequests: {
        where: {
          status: { in: ["SUBMITTED", "FALLBACK_USED"] },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          installAddressEncrypted: true,
          installAddress1Encrypted: true,
          installDate: true,
        },
      },
    },
  })) as AdminRetryOrder | null;

  if (!order) {
    throw new InstallationDispatchError("ORDER_NOT_FOUND");
  }
  if (!isAdminRetryableOrder(order)) {
    throw new InstallationDispatchError("ORDER_NOT_ADMIN_RETRYABLE");
  }
  if (order.activeAssignmentId) {
    throw new InstallationDispatchError("ORDER_ALREADY_HAS_ACTIVE_ASSIGNMENT");
  }

  const customerRequest = getActiveCustomerRequest(order);
  const installAddress = decryptNullablePii(customerRequest?.installAddressEncrypted);
  if (!installAddress) {
    return markAdminRetryNoCandidateFound(
      order.id,
      customerRequest?.id ?? null,
      "관리자 재실행 결과 설치 주소가 없어 후보를 선정할 수 없습니다.",
      now,
      adminId,
      reason,
    );
    return;
  }

  const productRequirement = getDispatchRequirement(order);
  if (!productRequirement.itemCode) {
    return markAdminRetryNoCandidateFound(
      order.id,
      customerRequest.id,
      "관리자 재실행 결과 제품 요구사항을 확인할 수 없습니다.",
      now,
      adminId,
      reason,
      {
        customerRequestId: customerRequest.id,
        assignmentSource: "ADMIN_RETRY",
        reasonCode: "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
        requiredCapabilities: [],
        requiredAqaraAppCapability: productRequirement.requiredAqaraAppCapability,
        installAddress,
        installDate: customerRequest.installDate,
        candidates: [],
      },
    );
  }
  const requiredCapabilities = productRequirement.requiredCapabilities;
  const requiredAqaraAppCapability = productRequirement.requiredAqaraAppCapability;
  const addressMain =
    decryptNullablePii(customerRequest.installAddress1Encrypted) ??
    decryptNullablePii(order.source?.addressEncrypted);
  const installers = await listDispatchCandidateInstallers({
    requiredCapabilities,
    requiredAqaraAppCapability,
  });
  const candidates = findBestMatchingInstallers(installAddress, installers);
  const candidate = candidates[0];
  if (!candidate) {
    return markAdminRetryNoCandidateFound(
      order.id,
      customerRequest.id,
      "관리자 재실행 결과 조건에 맞는 후보 기사가 없습니다.",
      now,
      adminId,
      reason,
      {
        customerRequestId: customerRequest.id,
        assignmentSource: "ADMIN_RETRY",
        reasonCode: installers.length === 0 ? "NO_CAPABILITY_MATCH" : "NO_REGION_MATCH",
        requiredCapabilities,
        requiredAqaraAppCapability,
        installAddress,
        installDate: customerRequest.installDate,
        candidates: [],
      },
    );
    return;
  }

  return createWaitingInstallerResponseAssignment(order.id, customerRequest.id, candidate, {
    now,
    baseUrl,
      tokenFactory,
      assignmentSource: "ADMIN_RETRY",
      currentOrderStatus: normalizeDispatchProgressStatus(order.status),
      eventType: "ADMIN_RETRY_ASSIGNMENT_CREATED",
    actorType: "ADMIN",
    actorId: adminId,
    reason: reason.trim(),
    candidateRun: {
      customerRequestId: customerRequest.id,
      assignmentSource: "ADMIN_RETRY",
      reasonCode: null,
      requiredCapabilities,
      requiredAqaraAppCapability,
      installAddress,
      installDate: customerRequest.installDate,
      candidates,
      selectedInstallerId: candidate.businessNumber,
    },
    smsContext: {
      addressMain,
      installDate: customerRequest.installDate,
    },
  });
}

export async function approveInstallationAssignmentByAdmin(
  assignmentId: string,
  {
    adminId,
    now = new Date(),
    baseUrl,
    tokenFactory = createInstallerResponseToken,
  }: ApproveInstallationAssignmentOptions,
): Promise<AssignmentDispatchResult> {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.installationInstallerAssignmentAttempt.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        installationOrderId: true,
        customerRequestId: true,
        installerId: true,
        status: true,
        assignmentSource: true,
        installationOrder: {
          select: {
            id: true,
            status: true,
            activeAssignmentId: true,
            currentInstallerId: true,
          },
        },
        customerRequest: {
          select: {
            installAddress1Encrypted: true,
            installDate: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new InstallationDispatchError("ASSIGNMENT_NOT_FOUND");
    }
    if (assignment.status !== "WAITING_ADMIN_REVIEW") {
      throw new InstallationDispatchError("ASSIGNMENT_NOT_WAITING_ADMIN_REVIEW");
    }
    if (assignment.installationOrder.status !== INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW) {
      throw new InstallationDispatchError("ORDER_NOT_WAITING_ADMIN_REVIEW");
    }
    if (assignment.installationOrder.activeAssignmentId !== assignment.id) {
      throw new InstallationDispatchError("ASSIGNMENT_NOT_ACTIVE");
    }
    const installer = await getInstallerContact(assignment.installerId, tx as never);
    if (!installer?.phone) {
      throw new InstallationDispatchError("INSTALLER_PHONE_NOT_FOUND");
    }

    const token = tokenFactory();
    await tx.installationInstallerAssignmentAttempt.update({
      where: { id: assignment.id },
      data: {
        approvedByAdminId: adminId,
        installerTokenHash: hashInstallerToken(token),
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_INSTALLER_RESPONSE",
      },
    });

    const responseUrl = `${stripTrailingSlash(baseUrl ?? getSmsLinkBaseUrl())}/i/i/${encodeURIComponent(token)}`;
    const smsContent = buildInstallerAssignmentRequestSmsContent({
      addressMain: decryptNullablePii(assignment.customerRequest?.installAddress1Encrypted),
      installDate: assignment.customerRequest?.installDate ?? null,
      responseUrl,
    });
    const normalizedInstallerPhone = normalizePhone11(installer.phone);

    await tx.installationNotification.upsert({
      where: { idempotencyKey: `installer-assignment-request:${assignment.id}` },
      create: {
        installationOrderId: assignment.installationOrderId,
        customerRequestId: assignment.customerRequestId,
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
      assignment.installationOrderId,
      INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
      {
        now,
        orderData: {
          activeAssignmentId: assignment.id,
          currentInstallerId: assignment.installerId,
        },
        event: {
          eventType: "ADMIN_APPROVED_ASSIGNMENT",
          actorType: "ADMIN",
          actorId: adminId,
          metadata: {
            assignmentId: assignment.id,
            customerRequestId: assignment.customerRequestId,
            installerId: assignment.installerId,
            assignmentSource: assignment.assignmentSource,
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
        assignmentType: assignment.assignmentSource,
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    } satisfies AssignmentDispatchResult;
  });
}

function getDispatchRequirement(order: Pick<ReadyOrder, "source">) {
  const dispatchRequirement = inferDispatchRequirementFromMemo(order.source?.memo);
  return {
    itemCode: dispatchRequirement.requiredCapabilities.length > 0 ? "SAVED_REQUIREMENTS" : null,
    itemName: null,
    quantity: null,
    requiredCapabilities: dispatchRequirement.requiredCapabilities,
    requiredAqaraAppCapability: dispatchRequirement.requiredAqaraAppCapability,
  };
}

async function markAdminRetryNoCandidateFound(
  orderId: string,
  customerRequestId: string | null,
  description: string,
  now: Date,
  adminId: string,
  reason: string,
  candidateRun?: CandidateRunInput,
) {
  let currentStatus: AssignmentDispatchResult["status"] =
    INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION;
  await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    currentStatus = normalizeDispatchProgressStatus(order?.status);

    if (candidateRun) {
      await recordCandidateRun(tx as never, orderId, now, candidateRun);
    }

    const issue = await createInstallationIssue(
      {
        installationOrderId: orderId,
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        title: "후보 기사 없음",
        description,
        metadata: { customerRequestId, adminId },
        now,
      },
      tx as never,
    );

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: orderId,
        fromStatus: currentStatus,
        toStatus: currentStatus,
        eventType: "ADMIN_RETRY_NO_INSTALLER_CANDIDATE",
        actorType: "ADMIN",
        actorId: adminId,
        reason: reason.trim(),
        metadata: {
          customerRequestId,
          issueId: issue.id,
        },
        createdAt: now,
      },
    });
  });

  return {
    assignmentId: null,
    status: currentStatus,
    activeAttempt: null,
    reasonCode: "INSTALLER_CANDIDATE_NOT_FOUND",
  } satisfies AssignmentDispatchResult;
}

async function markNoCandidateFound(
  orderId: string,
  customerRequestId: string | null,
  description: string,
  now: Date,
  candidateRun?: CandidateRunInput,
) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    const currentStatus = order?.status ?? INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION;

    if (candidateRun) {
      await recordCandidateRun(tx as never, orderId, now, candidateRun);
    }

    const issue = await createInstallationIssue(
      {
        installationOrderId: orderId,
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        title: "후보 기사 없음",
        description,
        metadata: { customerRequestId },
        now,
      },
      tx as never,
    );

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: orderId,
        fromStatus: currentStatus,
        toStatus: currentStatus,
        eventType: "INSTALLER_CANDIDATE_NOT_FOUND",
        actorType: "SYSTEM",
        actorId: null,
        reason: description,
        metadata: { customerRequestId, issueId: issue.id },
        createdAt: now,
      },
    });
  });
}

async function markUnmappedProductRequirement(
  orderId: string,
  customerRequestId: string | null,
  now: Date,
  candidateRun: CandidateRunInput,
) {
  const description = "제품을 설치 능력 요구사항으로 변환할 수 없습니다.";
  await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    const currentStatus = order?.status ?? INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION;

    await recordCandidateRun(tx as never, orderId, now, candidateRun);

    const issue = await createInstallationIssue(
      {
        installationOrderId: orderId,
        type: "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
        title: "제품 요구사항 미매핑",
        description,
        metadata: { customerRequestId },
        now,
      },
      tx as never,
    );

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: orderId,
        fromStatus: currentStatus,
        toStatus: currentStatus,
        eventType: "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
        actorType: "SYSTEM",
        actorId: null,
        reason: description,
        metadata: { customerRequestId, issueId: issue.id },
        createdAt: now,
      },
    });
  });
}

async function createWaitingInstallerResponseAssignment(
  orderId: string,
  customerRequestId: string,
  candidate: DispatchCandidateInstaller,
  options: AssignmentCreationOptions,
) {
  return prisma.$transaction(async (tx) => {
    const activeAssignment = await tx.installationInstallerAssignmentAttempt.findFirst({
      where: {
        installationOrderId: orderId,
        status: { in: ["WAITING_ADMIN_REVIEW", "WAITING_INSTALLER_RESPONSE", "SYSTEM_SMS_RETRY_PENDING"] },
      },
      select: { id: true, assignmentSource: true, status: true },
    });
    if (activeAssignment) {
      const assignmentStatus =
        activeAssignment.status === "SYSTEM_SMS_RETRY_PENDING"
          ? "SYSTEM_SMS_RETRY_PENDING"
          : activeAssignment.status === "WAITING_ADMIN_REVIEW"
            ? "WAITING_ADMIN_REVIEW"
            : "WAITING_INSTALLER_RESPONSE";
      if (options.candidateRun) {
        await recordCandidateRun(tx as never, orderId, options.now, {
          ...options.candidateRun,
          reasonCode:
            assignmentStatus === "SYSTEM_SMS_RETRY_PENDING"
              ? "SYSTEM_SMS_RETRY_PENDING"
              : assignmentStatus === "WAITING_ADMIN_REVIEW"
                ? "WAITING_ADMIN_REVIEW"
              : "ACTIVE_ASSIGNMENT_EXISTS",
          selectedInstallerId: null,
        });
      }
      return {
        assignmentId: null,
        status: INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
        activeAttempt: {
          id: activeAssignment.id,
          assignmentType: activeAssignment.assignmentSource,
          assignmentStatus,
          smsRetryPending: assignmentStatus === "SYSTEM_SMS_RETRY_PENDING",
        },
        reasonCode: "ACTIVE_ASSIGNMENT_EXISTS",
      } satisfies AssignmentDispatchResult;
    }

    const duplicateAssignment = await tx.installationInstallerAssignmentAttempt.findFirst({
      where: {
        installationOrderId: orderId,
        installerId: candidate.businessNumber,
      },
      select: { id: true },
    });
    if (duplicateAssignment) {
      if (options.candidateRun) {
        await recordCandidateRun(tx as never, orderId, options.now, {
          ...options.candidateRun,
          reasonCode: "DUPLICATE_INSTALLER_REQUEST",
          selectedInstallerId: null,
        });
      }
      return {
        assignmentId: null,
        status:
          options.assignmentSource === "ADMIN_RETRY"
            ? options.currentOrderStatus ?? INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION
            : INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
        activeAttempt: null,
        reasonCode: "DUPLICATE_INSTALLER_REQUEST",
      } satisfies AssignmentDispatchResult;
    }

    if (options.candidateRun) {
      await recordCandidateRun(tx as never, orderId, options.now, options.candidateRun);
    }

    const existingCount = await tx.installationInstallerAssignmentAttempt.count({
      where: { installationOrderId: orderId },
    });
    const waitsForAdminReview = ["AUTO", "ADMIN_RETRY"].includes(options.assignmentSource);
    const token = waitsForAdminReview ? null : options.tokenFactory();
    const assignment = await tx.installationInstallerAssignmentAttempt.create({
      data: {
        installationOrderId: orderId,
        customerRequestId,
        installerId: candidate.businessNumber,
        assignmentNumber: existingCount + 1,
        assignmentSource: options.assignmentSource,
        matchTier: candidate.matchTier ?? null,
        candidateRank: options.assignmentSource === "AUTO" ? existingCount + 1 : 1,
        selectionSnapshot: {
          installer: candidate,
          ...(options.actorId ? { createdByAdminId: options.actorId } : {}),
        },
        installerTokenHash: token ? hashInstallerToken(token) : null,
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: waitsForAdminReview ? "WAITING_ADMIN_REVIEW" : "WAITING_INSTALLER_RESPONSE",
      },
    });
    if (token) {
      const responseUrl = `${stripTrailingSlash(options.baseUrl ?? getSmsLinkBaseUrl())}/i/i/${encodeURIComponent(token)}`;
      const smsContent = buildInstallerAssignmentRequestSmsContent({
        addressMain: options.smsContext?.addressMain,
        installDate: options.smsContext?.installDate,
        responseUrl,
      });
      const normalizedCandidatePhone = normalizePhone11(candidate.phone);

      await tx.installationNotification.upsert({
        where: { idempotencyKey: `installer-assignment-request:${assignment.id}` },
        create: {
          installationOrderId: orderId,
          customerRequestId,
          assignmentAttemptId: assignment.id,
          smsType: "INSTALLER_ASSIGNMENT_REQUEST",
          recipientType: "INSTALLER",
          recipientPhoneEncrypted: encryptNullablePii(normalizedCandidatePhone),
          recipientPhoneHash: hmacPii(normalizedCandidatePhone),
          smsTemplateKey: smsContent.templateKey,
          smsBody: smsContent.text,
          provider: "solapi",
          status: "PENDING",
          idempotencyKey: `installer-assignment-request:${assignment.id}`,
        },
        update: {},
      });
    }

    const issueResolutionOrderData = await resolveNoCandidateIssueAfterAssignment(
      tx as never,
      orderId,
      options.now,
    );

    await transitionInstallationOrderStatus(
      orderId,
      waitsForAdminReview
        ? INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW
        : INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
      {
        now: options.now,
        orderData: {
          activeAssignmentId: assignment.id,
          currentInstallerId: candidate.businessNumber,
          ...issueResolutionOrderData,
        },
        event: {
          eventType: options.eventType,
          actorType: options.actorType,
          actorId: options.actorId ?? null,
          reason: options.reason ?? null,
          metadata: {
            customerRequestId,
            assignmentId: assignment.id,
            installerId: candidate.businessNumber,
            assignmentSource: options.assignmentSource,
          },
        },
      },
      tx as never,
    );

    return {
      assignmentId: assignment.id,
      status: waitsForAdminReview
        ? INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW
        : INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
      activeAttempt: {
        id: assignment.id,
        assignmentType: options.assignmentSource,
        assignmentStatus: waitsForAdminReview ? "WAITING_ADMIN_REVIEW" : "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    } satisfies AssignmentDispatchResult;
  });
}

async function resolveNoCandidateIssueAfterAssignment(
  tx: {
    installationIssue: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
      update: (args: unknown) => Promise<unknown>;
      count: (args: unknown) => Promise<number>;
    };
  },
  orderId: string,
  now: Date,
) {
  const issue = await tx.installationIssue.findFirst({
    where: {
      installationOrderId: orderId,
      type: "INSTALLER_CANDIDATE_NOT_FOUND",
      status: "OPEN",
    },
    select: { id: true },
  });

  if (!issue) return {};

  await tx.installationIssue.update({
    where: { id: issue.id },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
      resolutionNote: "기사 후보 재탐색 성공으로 자동 해결했습니다.",
      updatedAt: now,
    },
  });

  const remainingOpenIssueCount = await tx.installationIssue.count({
    where: {
      installationOrderId: orderId,
      status: "OPEN",
    },
  });

  if (remainingOpenIssueCount > 0) return {};

  return {
    hasOpenIssue: false,
    lastIssueId: null,
  };
}

function isAdminRetryableOrder(order: Pick<AdminRetryOrder, "status" | "hasOpenIssue">) {
  return order.hasOpenIssue;
}

function normalizeDispatchProgressStatus(status: string | null | undefined): AssignmentDispatchResult["status"] {
  if (
    status === INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW ||
    status === INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE
  ) {
    return status;
  }

  return INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION;
}

async function recordCandidateRun(
  tx: {
    installationInstallerCandidateRun: {
      create: (args: unknown) => Promise<unknown>;
    };
  },
  orderId: string,
  now: Date,
  run: CandidateRunInput,
) {
  await tx.installationInstallerCandidateRun.create({
    data: {
      installationOrderId: orderId,
      customerRequestId: run.customerRequestId,
      assignmentSource: run.assignmentSource,
      reasonCode: run.reasonCode,
      inputSnapshot: {
        requiredCapabilities: run.requiredCapabilities,
        requiredAqaraAppCapability: run.requiredAqaraAppCapability,
        installAddress: run.installAddress,
        installDate: run.installDate,
      },
      createdAt: now,
      candidates: {
        create: run.candidates.map((candidate, index) => ({
          installerId: candidate.businessNumber,
          rank: index + 1,
          isAutoRequestCandidate: candidate.businessNumber === run.selectedInstallerId,
          regionTier: candidate.matchTier ?? null,
          monthlyDispatchCount: candidate.monthlyDispatchCount ?? 0,
          lastRequestedAt: candidate.lastRequestedAt ?? null,
          excludedReason: null,
          decisionReason: `${candidate.matchTier ?? "MATCHED"} / 월 ${candidate.monthlyDispatchCount ?? 0}건`,
        })),
      },
    },
  });
}

export class InstallationDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationDispatchError";
  }
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

function getActiveCustomerRequest(order: ReadyOrder) {
  if (!order.activeCustomerRequestId) {
    return order.customerRequests[0] ?? null;
  }

  return (
    order.customerRequests.find((request) => request.id === order.activeCustomerRequestId) ??
    order.customerRequests[0] ??
    null
  );
}

async function recordSkippedAutoRequestCandidateRun(orderId: string, now: Date) {
  const order = (await prisma.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      source: {
        select: {
          memo: true,
          addressEncrypted: true,
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
          id: true,
          installAddressEncrypted: true,
          installDate: true,
        },
      },
    },
  })) as (ReadyOrder & { status: string; activeAssignmentId: string | null }) | null;

  if (!order) return false;

  const customerRequest = getActiveCustomerRequest(order);
  const productRequirement = getDispatchRequirement(order);
  await prisma.$transaction(async (tx) => {
    const reasonCode = await getSkippedAutoRequestReasonCode(tx as never, order, customerRequest, now);
    await recordCandidateRun(tx as never, order.id, now, {
      customerRequestId: customerRequest?.id ?? null,
      assignmentSource: "AUTO",
      reasonCode,
      requiredCapabilities: productRequirement.requiredCapabilities,
      requiredAqaraAppCapability: productRequirement.requiredAqaraAppCapability,
      installAddress: decryptNullablePii(customerRequest?.installAddressEncrypted) ?? null,
      installDate: customerRequest?.installDate ?? null,
      candidates: [],
    });
  });

  return true;
}

async function getSkippedAutoRequestReasonCode(
  tx: {
    installationInstallerAssignmentAttempt: {
      findFirst: (args: unknown) => Promise<{ status: string } | null>;
    };
  },
  order: ReadyOrder & { status: string; activeAssignmentId: string | null },
  customerRequest: ReadyOrder["customerRequests"][number] | null,
  now: Date,
) {
  if (order.status !== INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION) {
    return "STATUS_NOT_AUTO_REQUESTABLE";
  }

  if (order.activeAssignmentId) {
    const activeAssignment = await tx.installationInstallerAssignmentAttempt.findFirst({
      where: { id: order.activeAssignmentId },
      select: { status: true },
    });
    return activeAssignment?.status === "SYSTEM_SMS_RETRY_PENDING"
      ? "SYSTEM_SMS_RETRY_PENDING"
      : "ACTIVE_ASSIGNMENT_EXISTS";
  }

  if (!customerRequest?.installDate) {
    return "MISSING_INSTALL_DATE";
  }

  const minInstallDate = toKstDateString(addDays(now, 2)).replace(/-/g, "");
  const maxInstallDate = toKstDateString(addDays(now, 30)).replace(/-/g, "");
  const normalizedInstallDate = customerRequest.installDate.replace(/-/g, "");
  if (normalizedInstallDate < minInstallDate) {
    return "INSTALL_DATE_TOO_SOON";
  }
  if (normalizedInstallDate > maxInstallDate) {
    return "INSTALL_DATE_TOO_LATE";
  }

  if (!customerRequest.installAddressEncrypted) {
    return "UNPARSABLE_INSTALL_ADDRESS";
  }

  return "STATUS_NOT_AUTO_REQUESTABLE";
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toKstDateString(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
