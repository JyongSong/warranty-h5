import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";
import {
  findBestMatchingInstallers,
  type InstallationOrderInstaller,
} from "@/lib/installation/installer/matcher";
import {
  getInstallerContact,
  listDispatchCandidateInstallers,
} from "@/lib/installation/installer/source";
import {
  formatSourceItemsProductSummary,
  inferDispatchRequirementFromMemo,
  parseRequiredCapabilitiesText,
  serializeRequiredCapabilities,
} from "@/lib/installation/orders/source/source-items";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import {
  buildInstallerAssignmentRequestSmsContent,
  buildCustomerAssignmentConfirmedSmsContent,
  buildInstallerHappycallGuideSmsContent,
} from "@/lib/installation/notifications/sms-content";

export type InstallerAssignmentTokenStatus =
  | "VALID"
  | "NOT_FOUND"
  | "EXPIRED"
  | "RESPONDED"
  | "CANCELLED";

type LookupOptions = {
  now?: Date;
};

type ResponseInput = {
  response: "ACCEPT" | "REJECT";
  rejectReason?: string | null;
  now?: Date;
  tokenIsHash?: boolean;
  baseUrl?: string;
  tokenFactory?: () => string;
};

type AssignmentWithOrder = {
  id: string;
  installationOrderId: string;
  customerRequestId: string | null;
  installerId: string;
  assignmentSource: string;
  installerTokenExpiresAt: Date | null;
  status: string;
  installationOrder: {
    id: string;
    sourceErpOrderNo: string;
    status: string;
    sourceCustomerName: string | null;
    sourcePhone: string | null;
    sourceMemo: string | null;
    requiredCapabilitiesText: string | null;
    requiredAqaraAppCapability: string | null;
    productSummary?: string;
    requiredCapabilities?: string[];
    activeAssignmentId: string | null;
    customerRequests: Array<{
      id: string;
      installAddress: string | null;
      installAddress1: string | null;
      installAddressDetail: string | null;
      installDate: string | null;
      installTimeSlot: string | null;
      customerPhone: string | null;
    }>;
    candidateRuns?: Array<{
      candidates: Array<{
        installerId: string;
        rank: number | null;
      }>;
    }>;
  };
};

type EncryptedAssignmentWithOrder = Omit<AssignmentWithOrder, "installationOrder"> & {
  installationOrder: Omit<
    AssignmentWithOrder["installationOrder"],
    "sourceErpOrderNo" | "sourceCustomerName" | "sourcePhone" | "sourceMemo" | "requiredCapabilitiesText" | "customerRequests"
  > & {
    source: {
      sourceKey: string;
      customerNameEncrypted: string | null;
      phoneEncrypted: string | null;
      memo: string | null;
    } | null;
    customerRequests: Array<{
      id: string;
      installAddressEncrypted: string | null;
      installAddress1Encrypted: string | null;
      installAddressDetailEncrypted: string | null;
      installDate: string | null;
      installTimeSlot: string | null;
      customerPhoneEncrypted: string | null;
    }>;
  };
};

type InstallerResponseTransaction = {
  installationInstallerAssignmentAttempt: {
    findMany: (args: unknown) => Promise<Array<{ installerId: string; assignmentSource: string }>>;
    findFirst: (args: unknown) => Promise<{
      id: string;
      installerId: string;
      status: string;
    } | null>;
    update: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  installer: {
    findUnique: (args: unknown) => Promise<unknown | null>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  installationNotification: { upsert: (args: unknown) => Promise<unknown> };
};

export async function getInstallerAssignmentByToken(
  token: string,
  { now = new Date() }: LookupOptions = {},
) {
  const assignment = await prisma.installationInstallerAssignmentAttempt.findUnique({
    where: { installerTokenHash: hashInstallerToken(token.trim()) },
    select: assignmentSelect,
  });

  if (!assignment) {
    return { status: "NOT_FOUND" as const, assignment: null };
  }

  const typedAssignment = decryptAssignmentPii(assignment as EncryptedAssignmentWithOrder);

  return {
    status: getInstallerAssignmentTokenStatus(typedAssignment, now),
    assignment: toInstallerVisibleAssignment(typedAssignment),
  };
}

export async function respondInstallerAssignment(token: string, input: ResponseInput) {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.installationInstallerAssignmentAttempt.findUnique({
      where: { installerTokenHash: input.tokenIsHash ? token.trim() : hashInstallerToken(token.trim()) },
      select: assignmentSelect,
    });

    if (!assignment) {
      throw new InstallerResponseError("TOKEN_NOT_FOUND");
    }

    const typedAssignment = decryptAssignmentPii(assignment as EncryptedAssignmentWithOrder);
    const tokenStatus = getInstallerAssignmentTokenStatus(typedAssignment, now);
    if (tokenStatus === "EXPIRED" && !isSystemTimeoutResponse(input)) {
      throw new InstallerResponseError("TOKEN_EXPIRED");
    }
    if (tokenStatus === "RESPONDED") {
      throw new InstallerResponseError("ALREADY_RESPONDED");
    }
    if (tokenStatus === "CANCELLED") {
      throw new InstallerResponseError("ASSIGNMENT_CANCELLED");
    }
    if (
      typedAssignment.installationOrder.status !==
      INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE
    ) {
      throw new InstallerResponseError("ORDER_NOT_WAITING_INSTALLER_RESPONSE");
    }
    if (typedAssignment.installationOrder.activeAssignmentId !== typedAssignment.id) {
      throw new InstallerResponseError("ASSIGNMENT_NOT_ACTIVE");
    }

    if (input.response === "ACCEPT") {
      await acceptAssignment(tx as unknown as InstallerResponseTransaction, typedAssignment, now);
      return;
    }

    await rejectAssignment(tx as unknown as InstallerResponseTransaction, typedAssignment, {
      rejectReason: input.rejectReason,
      now,
      baseUrl: input.baseUrl,
      tokenFactory: input.tokenFactory ?? createInstallerResponseToken,
    });
  });
}

export class InstallerResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallerResponseError";
  }
}

const assignmentSelect = {
  id: true,
  installationOrderId: true,
  customerRequestId: true,
  installerId: true,
  assignmentSource: true,
  installerTokenExpiresAt: true,
  status: true,
  installationOrder: {
    select: {
      id: true,
      status: true,
      source: {
        select: {
          sourceKey: true,
          customerNameEncrypted: true,
          phoneEncrypted: true,
          memo: true,
        },
      },
      activeAssignmentId: true,
      customerRequests: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          installAddressEncrypted: true,
          installAddress1Encrypted: true,
          installAddressDetailEncrypted: true,
          installDate: true,
          installTimeSlot: true,
          customerPhoneEncrypted: true,
        },
      },
      candidateRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          candidates: {
            orderBy: { rank: "asc" },
            select: {
              installerId: true,
              rank: true,
            },
          },
        },
      },
    },
  },
} as const;

async function acceptAssignment(tx: InstallerResponseTransaction, assignment: AssignmentWithOrder, now: Date) {
  await tx.installationInstallerAssignmentAttempt.update({
    where: { id: assignment.id },
    data: {
      acceptedAt: now,
      status: "INSTALLER_ACCEPTED",
    },
  });

  const customerPhone =
    assignment.installationOrder.customerRequests[0]?.customerPhone ??
    assignment.installationOrder.sourcePhone;

  if (customerPhone) {
    const normalizedCustomerPhone = normalizePhone11(customerPhone);
    const smsContent = buildCustomerAssignmentConfirmedSmsContent({
      productSummary: getOrderProductSummary(assignment.installationOrder),
    });

    await tx.installationNotification.upsert({
      where: { idempotencyKey: `customer-assignment-confirmed:${assignment.id}` },
      create: {
        installationOrderId: assignment.installationOrderId,
        customerRequestId: assignment.customerRequestId,
        assignmentAttemptId: assignment.id,
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientType: "CUSTOMER",
        recipientPhoneEncrypted: encryptNullablePii(normalizedCustomerPhone),
        recipientPhoneHash: hmacPii(normalizedCustomerPhone),
        smsTemplateKey: smsContent.templateKey,
        smsBody: smsContent.text,
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: `customer-assignment-confirmed:${assignment.id}`,
      },
      update: {},
    });
  }

  const installer = await getInstallerContact(assignment.installerId, tx as never);
  if (installer?.phone) {
    const customerRequest = assignment.installationOrder.customerRequests[0] ?? null;
    const normalizedInstallerPhone = normalizePhone11(installer.phone);
    const smsContent = buildInstallerHappycallGuideSmsContent({
      address: formatInstallationAddress(
        customerRequest?.installAddress,
        customerRequest?.installAddressDetail,
      ),
      customerPhone: customerPhone ? normalizePhone11(customerPhone) : null,
      installDate: customerRequest?.installDate ?? null,
      productSummary: getOrderProductSummary(assignment.installationOrder),
    });

    await tx.installationNotification.upsert({
      where: { idempotencyKey: `installer-happycall-guide:${assignment.id}` },
      create: {
        installationOrderId: assignment.installationOrderId,
        customerRequestId: assignment.customerRequestId,
        assignmentAttemptId: assignment.id,
        smsType: "INSTALLER_HAPPYCALL_GUIDE",
        recipientType: "INSTALLER",
        recipientPhoneEncrypted: encryptNullablePii(normalizedInstallerPhone),
        recipientPhoneHash: hmacPii(normalizedInstallerPhone),
        smsTemplateKey: smsContent.templateKey,
        smsBody: smsContent.text,
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: `installer-happycall-guide:${assignment.id}`,
      },
      update: {},
    });
  }

  await transitionInstallationOrderStatus(
    assignment.installationOrderId,
    INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED,
    {
      now,
      event: {
        eventType: "INSTALLER_ACCEPTED",
        actorType: "INSTALLER",
        actorId: assignment.installerId,
        metadata: {
          assignmentId: assignment.id,
          customerRequestId: assignment.customerRequestId,
          installerId: assignment.installerId,
        },
      },
    },
    tx as never,
  );
}

async function rejectAssignment(
  tx: InstallerResponseTransaction,
  assignment: AssignmentWithOrder,
  options: {
    rejectReason: string | null | undefined;
    now: Date;
    baseUrl?: string;
    tokenFactory: () => string;
  },
) {
  const reason = options.rejectReason?.trim() || null;
  const timedOut = reason === INSTALLER_RESPONSE_TIMEOUT_REASON;
  const eventType = timedOut ? "INSTALLER_TIMED_OUT" : "INSTALLER_REJECTED";

  await tx.installationInstallerAssignmentAttempt.update({
    where: { id: assignment.id },
    data: timedOut
      ? {
          timedOutAt: options.now,
          status: "INSTALLER_RESPONSE_TIMED_OUT",
        }
      : {
          rejectedAt: options.now,
          rejectReason: reason,
          status: "INSTALLER_REJECTED",
        },
  });

  if (assignment.assignmentSource !== "AUTO") {
    await transitionInstallationOrderStatus(
      assignment.installationOrderId,
      INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
      {
        now: options.now,
        orderData: {
          activeAssignmentId: null,
          currentInstallerId: null,
        },
        event: {
          eventType,
          actorType: "INSTALLER",
          actorId: assignment.installerId,
          reason,
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
    return;
  }

  const customerRequest = assignment.installationOrder.customerRequests[0] ?? null;
  const attemptedAssignments = await listAttemptedAssignments(tx, assignment.installationOrderId);
  const activeAssignment = await tx.installationInstallerAssignmentAttempt.findFirst({
    where: {
      installationOrderId: assignment.installationOrderId,
      id: { not: assignment.id },
      status: { in: ["WAITING_INSTALLER_RESPONSE", "SYSTEM_SMS_RETRY_PENDING"] },
    },
    select: { id: true, installerId: true, status: true },
  });
  if (activeAssignment) {
    await transitionInstallationOrderStatus(
      assignment.installationOrderId,
      INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
      {
        now: options.now,
        orderData: {
          activeAssignmentId: activeAssignment.id,
          currentInstallerId: activeAssignment.installerId,
        },
        event: {
          eventType,
          actorType: "INSTALLER",
          actorId: assignment.installerId,
          reason,
          metadata: {
            assignmentId: assignment.id,
            activeAssignmentId: activeAssignment.id,
            customerRequestId: assignment.customerRequestId,
            installerId: assignment.installerId,
            activeInstallerId: activeAssignment.installerId,
            activeAssignmentStatus: activeAssignment.status,
          },
        },
      },
      tx as never,
    );
    return;
  }

  if (attemptedAssignments.autoAttemptCount >= MAX_AUTO_INSTALLER_REQUESTS_PER_RESERVATION) {
    await markAutoFallbackExhausted(tx, assignment, {
      reason,
      now: options.now,
      description: "자동 배정 요청 3회 한도에 도달했습니다.",
      eventMetadata: {
        autoAttemptCount: attemptedAssignments.autoAttemptCount,
      },
    });
    return;
  }

  const nextCandidate = await findNextInstallerCandidate(
    tx,
    customerRequest?.installAddress,
    attemptedAssignments.installerIds,
    parseRequiredCapabilitiesText(assignment.installationOrder.requiredCapabilitiesText),
    assignment.installationOrder.requiredAqaraAppCapability ?? "NONE",
    getPreviousCandidateInstallerIds(assignment),
  );

  if (!nextCandidate) {
    await markAutoFallbackExhausted(tx, assignment, {
      reason,
      now: options.now,
      description: "기사 거절 또는 타임아웃 후 사용할 수 있는 차순위 후보가 없습니다.",
    });
    return;
  }

  const existingCount = await tx.installationInstallerAssignmentAttempt.count({
    where: { installationOrderId: assignment.installationOrderId },
  });
  const token = options.tokenFactory();
  const nextAssignment = await tx.installationInstallerAssignmentAttempt.create({
    data: {
      installationOrderId: assignment.installationOrderId,
      customerRequestId: assignment.customerRequestId,
      installerId: nextCandidate.businessNumber,
      assignmentNumber: existingCount + 1,
      assignmentSource: "AUTO",
      matchTier: nextCandidate.matchTier ?? null,
      candidateRank: existingCount + 1,
      selectionSnapshot: {
        installer: nextCandidate,
        rejectedAssignmentId: assignment.id,
        reusedCandidateRun: "reusedCandidateRun" in nextCandidate ? nextCandidate.reusedCandidateRun : false,
        revalidationExclusions:
          "revalidationExclusions" in nextCandidate ? nextCandidate.revalidationExclusions : [],
      },
      installerTokenHash: hashInstallerToken(token),
      installerTokenExpiresAt: null,
      installerNotifiedAt: null,
      status: "WAITING_INSTALLER_RESPONSE",
    },
  });
  const responseUrl = `${stripTrailingSlash(options.baseUrl ?? getSmsLinkBaseUrl())}/i/i/${encodeURIComponent(token)}`;
  const normalizedNextCandidatePhone = normalizePhone11(nextCandidate.phone);
  const smsContent = buildInstallerAssignmentRequestSmsContent({
    addressMain:
      assignment.installationOrder.customerRequests[0]?.installAddress1 ??
      assignment.installationOrder.customerRequests[0]?.installAddress ??
      null,
    installDate: assignment.installationOrder.customerRequests[0]?.installDate ?? null,
    responseUrl,
  });

  await tx.installationNotification.upsert({
    where: { idempotencyKey: `installer-assignment-request:${nextAssignment.id}` },
    create: {
      installationOrderId: assignment.installationOrderId,
      customerRequestId: assignment.customerRequestId,
      assignmentAttemptId: nextAssignment.id,
      smsType: "INSTALLER_ASSIGNMENT_REQUEST",
      recipientType: "INSTALLER",
      recipientPhoneEncrypted: encryptNullablePii(normalizedNextCandidatePhone),
      recipientPhoneHash: hmacPii(normalizedNextCandidatePhone),
      smsTemplateKey: smsContent.templateKey,
      smsBody: smsContent.text,
      provider: "solapi",
      status: "PENDING",
      idempotencyKey: `installer-assignment-request:${nextAssignment.id}`,
    },
    update: {},
  });

  await transitionInstallationOrderStatus(
    assignment.installationOrderId,
    INSTALLATION_ORDER_STATUSES.WAITING_INSTALLER_RESPONSE,
    {
      now: options.now,
      orderData: {
        activeAssignmentId: nextAssignment.id,
        currentInstallerId: nextCandidate.businessNumber,
      },
      event: {
        eventType,
        actorType: "INSTALLER",
        actorId: assignment.installerId,
        reason,
        metadata: {
          assignmentId: assignment.id,
          nextAssignmentId: nextAssignment.id,
          customerRequestId: assignment.customerRequestId,
          installerId: assignment.installerId,
          nextInstallerId: nextCandidate.businessNumber,
        },
      },
    },
    tx as never,
  );
}

const INSTALLER_RESPONSE_TIMEOUT_REASON = "INSTALLER_RESPONSE_TIMEOUT";

function isSystemTimeoutResponse(input: ResponseInput) {
  return input.tokenIsHash === true &&
    input.response === "REJECT" &&
    input.rejectReason === INSTALLER_RESPONSE_TIMEOUT_REASON;
}
const MAX_AUTO_INSTALLER_REQUESTS_PER_RESERVATION = 3;

function createInstallerResponseToken() {
  return randomBytes(16).toString("base64url");
}

async function findNextInstallerCandidate(
  tx: InstallerResponseTransaction,
  address: string | null | undefined,
  excludedInstallerIds: Set<string>,
  requiredCapabilities: string[],
  requiredAqaraAppCapability: string,
  previousCandidateInstallerIds: string[] = [],
) {
  if (!address) return null;

  const candidates = await listDispatchCandidateInstallers(
    { requiredCapabilities, requiredAqaraAppCapability },
    tx as never,
  );

  const matchedCandidates = findBestMatchingInstallers(address, candidates).filter(
    (candidate: InstallationOrderInstaller) => !excludedInstallerIds.has(candidate.businessNumber),
  );
  const matchedCandidateIds = new Set(matchedCandidates.map((candidate) => candidate.businessNumber));
  const revalidationExclusions = previousCandidateInstallerIds
    .filter((installerId) => !excludedInstallerIds.has(installerId))
    .filter((installerId) => !matchedCandidateIds.has(installerId))
    .map((installerId) => ({
      installerId,
      reason: "REVALIDATION_FAILED",
    }));
  for (const installerId of previousCandidateInstallerIds) {
    const candidate = matchedCandidates.find(
      (matchedCandidate) => matchedCandidate.businessNumber === installerId,
    );
    if (candidate) {
      return { ...candidate, reusedCandidateRun: true, revalidationExclusions };
    }
  }

  const nextCandidate = matchedCandidates[0] ?? null;
  return nextCandidate ? { ...nextCandidate, revalidationExclusions } : null;
}

function getPreviousCandidateInstallerIds(assignment: AssignmentWithOrder) {
  const candidates = assignment.installationOrder.candidateRuns?.[0]?.candidates ?? [];
  return candidates
    .slice()
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
    .map((candidate) => candidate.installerId);
}

async function listAttemptedAssignments(
  tx: InstallerResponseTransaction,
  installationOrderId: string,
) {
  const assignments = await tx.installationInstallerAssignmentAttempt.findMany({
    where: { installationOrderId },
    select: { installerId: true, assignmentSource: true },
  });
  return {
    installerIds: new Set(assignments.map((assignment) => assignment.installerId)),
    autoAttemptCount: assignments.filter((assignment) => assignment.assignmentSource === "AUTO").length,
  };
}

async function markAutoFallbackExhausted(
  tx: InstallerResponseTransaction,
  assignment: AssignmentWithOrder,
  options: {
    reason: string | null;
    now: Date;
    description: string;
    eventMetadata?: Record<string, unknown>;
  },
) {
  const issue = await createInstallationIssue(
    {
      installationOrderId: assignment.installationOrderId,
      type: "INSTALLER_CANDIDATE_EXHAUSTED",
      title: "후보 기사 소진",
      description: options.description,
      metadata: {
        assignmentId: assignment.id,
        customerRequestId: assignment.customerRequestId,
        installerId: assignment.installerId,
        ...(options.eventMetadata ?? {}),
      },
      now: options.now,
    },
    tx as never,
  );

  await transitionInstallationOrderStatus(
    assignment.installationOrderId,
    INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
    {
      now: options.now,
      orderData: {
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: issue.id,
      },
      event: {
        eventType: "INSTALLER_CANDIDATE_EXHAUSTED",
        actorType: "INSTALLER",
        actorId: assignment.installerId,
        reason: options.reason,
        metadata: {
          assignmentId: assignment.id,
          customerRequestId: assignment.customerRequestId,
          installerId: assignment.installerId,
          issueId: issue.id,
          ...(options.eventMetadata ?? {}),
        },
      },
    },
    tx as never,
  );
}

function toInstallerVisibleAssignment(assignment: AssignmentWithOrder): AssignmentWithOrder {
  if (assignment.status === "INSTALLER_ACCEPTED") {
    return {
      ...assignment,
      installationOrder: {
        ...assignment.installationOrder,
        productSummary: getOrderProductSummary(assignment.installationOrder),
        requiredCapabilities: parseRequiredCapabilitiesText(
          assignment.installationOrder.requiredCapabilitiesText,
        ),
      },
    } as AssignmentWithOrder;
  }

  return {
    ...assignment,
    installationOrder: {
      ...assignment.installationOrder,
      sourceCustomerName: null,
      sourcePhone: null,
      productSummary: getOrderProductSummary(assignment.installationOrder),
      requiredCapabilities: parseRequiredCapabilitiesText(
        assignment.installationOrder.requiredCapabilitiesText,
      ),
      customerRequests: assignment.installationOrder.customerRequests.map((request) => ({
        ...request,
        installAddress: request.installAddress1 ?? request.installAddress,
        installAddressDetail: null,
        customerPhone: null,
      })),
    },
  } as AssignmentWithOrder;
}

function decryptAssignmentPii(assignment: EncryptedAssignmentWithOrder): AssignmentWithOrder {
  const {
    source,
    customerRequests,
    ...installationOrderFields
  } = assignment.installationOrder;
  const dispatchRequirement = inferDispatchRequirementFromMemo(source?.memo);

  return {
    ...assignment,
    installationOrder: {
      ...installationOrderFields,
      sourceErpOrderNo: source?.sourceKey ?? "",
      sourceMemo: source?.memo ?? null,
      requiredCapabilitiesText: serializeRequiredCapabilitiesForResponse(
        dispatchRequirement.requiredCapabilities,
      ),
      requiredAqaraAppCapability: dispatchRequirement.requiredAqaraAppCapability,
      sourceCustomerName: decryptNullablePii(source?.customerNameEncrypted),
      sourcePhone: decryptNullablePii(source?.phoneEncrypted),
      customerRequests: customerRequests.map((request) => {
        const {
          installAddressEncrypted,
          installAddress1Encrypted,
          installAddressDetailEncrypted,
          customerPhoneEncrypted,
          ...requestFields
        } = request;

        return {
          ...requestFields,
          installAddress: decryptNullablePii(installAddressEncrypted),
          installAddress1: decryptNullablePii(installAddress1Encrypted),
          installAddressDetail: decryptNullablePii(installAddressDetailEncrypted),
          customerPhone: decryptNullablePii(customerPhoneEncrypted),
        };
      }),
    },
  };
}

function serializeRequiredCapabilitiesForResponse(value: string[]) {
  return serializeRequiredCapabilities(value);
}

function getInstallerAssignmentTokenStatus(
  assignment: {
    status: string;
    installerTokenExpiresAt: Date | null;
  },
  now: Date,
): InstallerAssignmentTokenStatus {
  if (
    assignment.status === "ADMIN_MANUAL_OVERRIDDEN" ||
    assignment.status === "ADMIN_COMPLETED" ||
    assignment.status === "SYSTEM_SMS_FAILED"
  ) {
    return "CANCELLED";
  }
  if (["INSTALLER_ACCEPTED", "INSTALLER_REJECTED", "INSTALLER_RESPONSE_TIMED_OUT"].includes(assignment.status)) {
    return "RESPONDED";
  }
  if (assignment.installerTokenExpiresAt && assignment.installerTokenExpiresAt.getTime() < now.getTime()) {
    return "EXPIRED";
  }
  return "VALID";
}

function hashInstallerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function formatInstallationAddress(address: string | null | undefined, detail: string | null | undefined) {
  return [address?.trim(), detail?.trim()].filter(Boolean).join(" ") || null;
}

function getOrderProductSummary(order: { sourceMemo?: string | null }) {
  return formatSourceItemsProductSummary(null, order.sourceMemo);
}
