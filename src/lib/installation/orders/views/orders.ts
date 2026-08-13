import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptNullablePii, hmacPii, normalizeNameForHash, normalizePhone11 } from "@/lib/piiCrypto";
import { normalizePhone } from "@/lib/phone";

export type InstallationOrderStatusSummary = Awaited<ReturnType<typeof listInstallationOrderStatuses>>[number];
export type InstallationOrderRawRow = Awaited<ReturnType<typeof listInstallationOrderRawRows>>[number];
export type InstallationOrderStatusView =
  | "all"
  | "active"
  | "attention"
  | "attentionCustomerInputSmsRequired"
  | "attentionAdminReview"
  | "attentionIssueOnly"
  | "customerInputSmsRequired"
  | "waitingCustomerInput"
  | "preAssignment"
  | "waitingAdminReview"
  | "waitingInstallerResponse"
  | "assigned"
  | "waitingHqReview"
  | "completed"
  | "cancelled";
export type InstallationOrderSearchField =
  | "desiredInstallDate"
  | "customerName"
  | "customerPhone"
  | "orderNumber"
  | "installerName"
  | "installerPhone"
  | "orderDate"
  | "installerDateRange";
export type InstallationOrderSearchCondition = {
  field: InstallationOrderSearchField;
  keyword?: string;
  from?: string;
  to?: string;
};

const TERMINAL_INSTALLATION_ORDER_STATUSES = ["CANCELLED", "COMPLETED"] as const;

const installationOrderSourceSelect = {
  sourceKey: true,
  customerNameEncrypted: true,
  customerNameHash: true,
  phoneEncrypted: true,
  phoneHash: true,
  addressEncrypted: true,
  dueDate: true,
  orderNumbers: true,
  noGirl: true,
  memo: true,
} as const;

const installationOrderRawSelect = {
  id: true,
  sourceId: true,
  source: {
    select: installationOrderSourceSelect,
  },
  status: true,
  activeCustomerRequestId: true,
  activeAssignmentId: true,
  currentInstallerId: true,
  hasOpenIssue: true,
  lastIssueId: true,
  cancelledAt: true,
  cancelReason: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const installationCustomerRequestListSelect = {
  id: true,
  installAddressEncrypted: true,
  installDate: true,
  installTimeSlot: true,
  customerPhoneEncrypted: true,
  fallbackUsed: true,
  status: true,
} as const;

const installationAssignmentAttemptListSelect = {
  id: true,
  installerId: true,
  installer: {
    select: {
      name: true,
      phone: true,
      branch: true,
    },
  },
  assignmentNumber: true,
  assignmentSource: true,
  status: true,
  acceptedAt: true,
  rejectedAt: true,
  createdAt: true,
} as const;

export async function listInstallationOrderRawRows({
  limit = 200,
  query = "",
  searchCondition,
  statusView = "active",
}: {
  limit?: number;
  query?: string;
  searchCondition?: InstallationOrderSearchCondition;
  statusView?: InstallationOrderStatusView;
} = {}) {
  const searchWhere = buildInstallationOrderSearchWhere(query);
  const selectedSearchWhere = await buildInstallationOrderSelectedSearchWhere(searchCondition);
  const statusWhere = buildInstallationOrderStatusViewWhere(statusView);

  return prisma.installationOrder.findMany({
    where: {
      ...statusWhere,
      ...(selectedSearchWhere ? { AND: [selectedSearchWhere] } : {}),
      ...(searchWhere ? { OR: searchWhere } : {}),
    },
    orderBy: { statusChangedAt: "desc" },
    take: limit,
    select: installationOrderRawSelect,
  });
}

export async function listInstallationOrderStatuses({
  limit = 200,
  offset = 0,
  query = "",
  searchCondition,
  statusChangedFrom,
  statusChangedTo,
  statusView = "active",
}: {
  limit?: number;
  offset?: number;
  query?: string;
  searchCondition?: InstallationOrderSearchCondition;
  statusChangedFrom?: Date;
  statusChangedTo?: Date;
  statusView?: InstallationOrderStatusView;
} = {}) {
  const searchWhere = buildInstallationOrderSearchWhere(query);
  const selectedSearchWhere = await buildInstallationOrderSelectedSearchWhere(searchCondition);
  const statusWhere = buildInstallationOrderStatusViewWhere(statusView);
  const statusChangedWhere = buildStatusChangedAtWhere({ statusChangedFrom, statusChangedTo });
  const orders = await prisma.installationOrder.findMany({
    where: {
      ...statusWhere,
      ...statusChangedWhere,
      ...(selectedSearchWhere ? { AND: [selectedSearchWhere] } : {}),
      ...(searchWhere ? { OR: searchWhere } : {}),
    },
    orderBy: { statusChangedAt: "desc" },
    ...(offset > 0 ? { skip: offset } : {}),
    take: limit,
    select: {
      id: true,
      source: {
        select: installationOrderSourceSelect,
      },
      status: true,
      activeCustomerRequestId: true,
      activeAssignmentId: true,
      activeCustomerRequest: {
        select: installationCustomerRequestListSelect,
      },
      activeAssignment: {
        select: installationAssignmentAttemptListSelect,
      },
      currentInstallerId: true,
      hasOpenIssue: true,
      statusChangedAt: true,
      createdAt: true,
      customerRequests: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: installationCustomerRequestListSelect,
      },
      assignmentAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: installationAssignmentAttemptListSelect,
      },
      issues: {
        where: { status: "OPEN" },
        select: {
          type: true,
        },
      },
    },
  });

  return orders.map((order) => {
    const {
      source,
      activeCustomerRequest,
      activeAssignment,
      customerRequests,
      ...orderFields
    } = order;

    const sourceCustomerName = tryDecryptNullablePiiForList(source?.customerNameEncrypted);
    const sourcePhone = tryDecryptNullablePiiForList(source?.phoneEncrypted);
    const sourceAddress = tryDecryptNullablePiiForList(source?.addressEncrypted);

    return {
      ...orderFields,
      sourceErpOrderNo: source?.sourceKey ?? "",
      sourceExternalOrderNumbers: source?.orderNumbers ?? null,
      sourceNoGirl: source?.noGirl ?? null,
      sourceOrderDate: source?.dueDate ?? null,
      sourceMemo: source?.memo ?? null,
      sourceItemsJsonText: null as string | null,
      requiredCapabilities: null as string | null,
      requiredAqaraAppCapability: null as string | null,
      sourceCustomerName,
      sourcePhone,
      sourceAddress,
      customerRequests: [activeCustomerRequest ?? customerRequests[0]]
        .filter((request): request is NonNullable<typeof request> => Boolean(request))
        .map((request) => {
          const { installAddressEncrypted, customerPhoneEncrypted, ...requestFields } = request;

          return {
            ...requestFields,
            installAddress: tryDecryptNullablePiiForList(installAddressEncrypted),
            customerPhone: tryDecryptNullablePiiForList(customerPhoneEncrypted),
          };
        }),
      assignmentAttempts: [activeAssignment ?? order.assignmentAttempts[0]].filter(
        (assignment): assignment is NonNullable<typeof assignment> => Boolean(assignment),
      ),
    };
  });
}

function tryDecryptNullablePiiForList(value: string | null | undefined) {
  try {
    return decryptNullablePii(value);
  } catch {
    return null;
  }
}

export async function countInstallationOrderStatuses({
  query = "",
  searchCondition,
  statusChangedFrom,
  statusChangedTo,
  statusView = "active",
}: {
  query?: string;
  searchCondition?: InstallationOrderSearchCondition;
  statusChangedFrom?: Date;
  statusChangedTo?: Date;
  statusView?: InstallationOrderStatusView;
} = {}) {
  const searchWhere = buildInstallationOrderSearchWhere(query);
  const selectedSearchWhere = await buildInstallationOrderSelectedSearchWhere(searchCondition);
  const statusWhere = buildInstallationOrderStatusViewWhere(statusView);
  const statusChangedWhere = buildStatusChangedAtWhere({ statusChangedFrom, statusChangedTo });

  return prisma.installationOrder.count({
    where: {
      ...statusWhere,
      ...statusChangedWhere,
      ...(selectedSearchWhere ? { AND: [selectedSearchWhere] } : {}),
      ...(searchWhere ? { OR: searchWhere } : {}),
    },
  });
}

function buildStatusChangedAtWhere({
  statusChangedFrom,
  statusChangedTo,
}: {
  statusChangedFrom?: Date;
  statusChangedTo?: Date;
}): Prisma.InstallationOrderWhereInput {
  if (!statusChangedFrom && !statusChangedTo) return {};

  return {
    statusChangedAt: {
      ...(statusChangedFrom ? { gte: statusChangedFrom } : {}),
      ...(statusChangedTo ? { lt: statusChangedTo } : {}),
    },
  };
}

function buildInstallationOrderStatusViewWhere(
  statusView: InstallationOrderStatusView,
): Prisma.InstallationOrderWhereInput {
  if (statusView === "all") return {};
  if (statusView === "attention") {
    return {
      OR: [
        { hasOpenIssue: true },
        { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
        { status: "WAITING_ADMIN_REVIEW" },
      ],
    };
  }
  if (statusView === "attentionCustomerInputSmsRequired") return { status: "CUSTOMER_INPUT_SMS_REQUIRED" };
  if (statusView === "attentionAdminReview") return { status: "WAITING_ADMIN_REVIEW" };
  if (statusView === "attentionIssueOnly") {
    return {
      hasOpenIssue: true,
      status: { notIn: ["CUSTOMER_INPUT_SMS_REQUIRED", "WAITING_ADMIN_REVIEW"] },
    };
  }
  if (statusView === "customerInputSmsRequired") return { status: "CUSTOMER_INPUT_SMS_REQUIRED" };
  if (statusView === "waitingCustomerInput") return { status: "WAITING_CUSTOMER_INPUT" };
  if (statusView === "preAssignment") return { status: "READY_FOR_CANDIDATE_SELECTION" };
  if (statusView === "waitingAdminReview") return { status: "WAITING_ADMIN_REVIEW" };
  if (statusView === "waitingInstallerResponse") return { status: "WAITING_INSTALLER_RESPONSE" };
  if (statusView === "assigned") return { status: "INSTALLER_ASSIGNED" };
  if (statusView === "waitingHqReview") return { status: "WAITING_HQ_REVIEW" };
  if (statusView === "completed") return { status: "COMPLETED" };
  if (statusView === "cancelled") return { status: "CANCELLED" };

  return {
    status: { notIn: [...TERMINAL_INSTALLATION_ORDER_STATUSES] },
  };
}

function buildInstallationOrderSearchWhere(query: string): Prisma.InstallationOrderWhereInput[] | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const sourceIdentifierSearchWhere = buildSourceIdentifierSearchWhere(trimmed);

  try {
    const phoneHash = hmacPii(normalizePhone11(trimmed));
    return [
      { source: { is: { phoneHash } } },
      { customerRequests: { some: { customerPhoneHash: phoneHash } } },
      ...sourceIdentifierSearchWhere,
    ];
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "PHONE_11_DIGITS_REQUIRED") {
      throw error;
    }
  }

  return [{ source: { is: { customerNameHash: hmacPii(normalizeNameForHash(trimmed)) } } }, ...sourceIdentifierSearchWhere];
}

function buildSourceIdentifierSearchWhere(query: string): Prisma.InstallationOrderWhereInput[] {
  return [
    { source: { is: { sourceKey: { contains: query, mode: "insensitive" } } } },
    { source: { is: { orderNumbers: { contains: query, mode: "insensitive" } } } },
    { source: { is: { noGirl: { contains: query, mode: "insensitive" } } } },
  ];
}

async function buildInstallationOrderSelectedSearchWhere(
  condition: InstallationOrderSearchCondition | undefined,
): Promise<Prisma.InstallationOrderWhereInput | null> {
  if (!condition) return null;

  if (condition.field === "desiredInstallDate") {
    const range = buildStringDateRange(condition);
    if (!range) return null;
    return {
      customerRequests: { some: { installDate: range } },
    };
  }

  if (condition.field === "orderDate") {
    const range = buildCompactStringDateRange(condition);
    if (!range) return null;
    return { source: { is: { dueDate: range } } };
  }

  // Combined: a specific installer AND an order-date range.
  if (condition.field === "installerDateRange") {
    const installerKeyword = condition.keyword?.trim();
    const range = buildCompactStringDateRange(condition);
    if (!installerKeyword || !range) return null;

    const orClauses: Prisma.InstallerWhereInput[] = [
      { name: { contains: installerKeyword, mode: "insensitive" } },
      { branch: { contains: installerKeyword, mode: "insensitive" } },
    ];
    const phoneKeyword = normalizePhone(installerKeyword);
    if (phoneKeyword) {
      orClauses.push({ phone: { contains: phoneKeyword, mode: "insensitive" } });
    }
    const installerIds = await findInstallerIds({ OR: orClauses });

    return {
      AND: [buildInstallerIdOrderWhere(installerIds), { source: { is: { dueDate: range } } }],
    };
  }

  const keyword = condition.keyword?.trim();
  if (!keyword) return null;

  if (condition.field === "customerName") {
    return { source: { is: { customerNameHash: hmacPii(normalizeNameForHash(keyword)) } } };
  }

  if (condition.field === "customerPhone") {
    const normalizedPhone = normalizeSelectedPhone11(keyword);
    if (!normalizedPhone) return { id: "__NO_MATCHING_PHONE__" };
    const phoneHash = hmacPii(normalizedPhone);
    return {
      OR: [
        { source: { is: { phoneHash } } },
        { customerRequests: { some: { customerPhoneHash: phoneHash } } },
      ],
    };
  }

  if (condition.field === "orderNumber") {
    return {
      OR: buildSourceIdentifierSearchWhere(keyword),
    };
  }

  if (condition.field === "installerName") {
    const installerIds = await findInstallerIds({
      OR: [
        { name: { contains: keyword, mode: "insensitive" } },
        { branch: { contains: keyword, mode: "insensitive" } },
      ],
    });
    return buildInstallerIdOrderWhere(installerIds);
  }

  const phoneKeyword = normalizePhone(keyword);
  if (!phoneKeyword) return buildInstallerIdOrderWhere([]);
  const installerIds = await findInstallerIds({
    phone: { contains: phoneKeyword, mode: "insensitive" },
  });
  return buildInstallerIdOrderWhere(installerIds);
}

function normalizeSelectedPhone11(value: string) {
  try {
    return normalizePhone11(value);
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_11_DIGITS_REQUIRED") {
      return null;
    }
    throw error;
  }
}

async function findInstallerIds(where: Prisma.InstallerWhereInput) {
  const installers = await prisma.installer.findMany({
    where,
    select: { id: true },
  });

  return installers.map((installer) => installer.id);
}

function buildInstallerIdOrderWhere(installerIds: string[]): Prisma.InstallationOrderWhereInput {
  if (installerIds.length === 0) return { id: "__NO_MATCHING_INSTALLER__" };

  return {
    OR: [
      { currentInstallerId: { in: installerIds } },
      { assignmentAttempts: { some: { installerId: { in: installerIds } } } },
    ],
  };
}

function buildStringDateRange(condition: InstallationOrderSearchCondition) {
  const from = normalizeDateOnlySearchValue(condition.from);
  const to = normalizeDateOnlySearchValue(condition.to);
  if (!from && !to) return null;

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

function buildCompactStringDateRange(condition: InstallationOrderSearchCondition) {
  const from = normalizeCompactDateOnlySearchValue(condition.from);
  const to = normalizeCompactDateOnlySearchValue(condition.to);
  if (!from && !to) return null;

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

function normalizeDateOnlySearchValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeCompactDateOnlySearchValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replaceAll("-", "");
  return null;
}
