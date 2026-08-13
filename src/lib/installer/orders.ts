import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";

export type InstallerOrderStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "TIMED_OUT" | "COMPLETED";

export type InstallerOrderItem = {
  orderId: string;
  attemptId: string | null; // present + actionable when status === "PENDING"
  status: InstallerOrderStatus;
  erpOrderNo: string;
  productSummary: string;
  installDate: string | null;
  installTimeSlot: string | null;
  address: string | null;
  // Customer name/phone are hidden until the installer accepts (PRD §6.2).
  customerName: string | null;
  customerPhone: string | null;
  completedDate?: string | null; // YYYY-MM-DD (KST), set for COMPLETED items
};

export type InstallerOrdersGrouped = {
  pending: InstallerOrderItem[];
  active: InstallerOrderItem[];
  completed: InstallerOrderItem[];
  history: InstallerOrderItem[];
};

const orderContentSelect = {
  id: true,
  status: true,
  activeAssignmentId: true,
  currentInstallerId: true,
  source: {
    select: {
      sourceKey: true,
      customerNameEncrypted: true,
      phoneEncrypted: true,
      memo: true,
    },
  },
  customerRequests: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    select: {
      installAddressEncrypted: true,
      installAddressDetailEncrypted: true,
      installDate: true,
      installTimeSlot: true,
      customerPhoneEncrypted: true,
    },
  },
} as const;

type OrderContent = {
  id: string;
  status: string;
  activeAssignmentId: string | null;
  currentInstallerId: string | null;
  source: {
    sourceKey: string;
    customerNameEncrypted: string | null;
    phoneEncrypted: string | null;
    memo: string | null;
  } | null;
  customerRequests: Array<{
    installAddressEncrypted: string | null;
    installAddressDetailEncrypted: string | null;
    installDate: string | null;
    installTimeSlot: string | null;
    customerPhoneEncrypted: string | null;
  }>;
};

function summarizeProducts(memo: string | null | undefined): string {
  if (!memo) return "";
  const products = memo.split("/").map((p) => p.trim()).filter(Boolean);
  if (products.length <= 1) return memo.trim();
  return `${products[0]} 외`;
}

function shapeOrder(
  order: OrderContent,
  { attemptId, status, piiVisible }: { attemptId: string | null; status: InstallerOrderStatus; piiVisible: boolean },
): InstallerOrderItem {
  const req = order.customerRequests[0] ?? null;
  const address =
    [decryptNullablePii(req?.installAddressEncrypted), decryptNullablePii(req?.installAddressDetailEncrypted)]
      .filter(Boolean)
      .join(" ") || null;

  return {
    orderId: order.id,
    attemptId,
    status,
    erpOrderNo: order.source?.sourceKey ?? "",
    productSummary: summarizeProducts(order.source?.memo),
    installDate: req?.installDate ?? null,
    installTimeSlot: req?.installTimeSlot ?? null,
    address,
    customerName: piiVisible ? decryptNullablePii(order.source?.customerNameEncrypted) : null,
    customerPhone: piiVisible
      ? decryptNullablePii(req?.customerPhoneEncrypted) ?? decryptNullablePii(order.source?.phoneEncrypted)
      : null,
  };
}

export async function getInstallerOrders(installerId: string): Promise<InstallerOrdersGrouped> {
  const [pendingAttempts, activeOrders, completedOrders, historyAttempts] = await Promise.all([
    prisma.installationInstallerAssignmentAttempt.findMany({
      where: { installerId, status: "WAITING_INSTALLER_RESPONSE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, installationOrder: { select: orderContentSelect } },
    }),
    prisma.installationOrder.findMany({
      where: { currentInstallerId: installerId, status: "INSTALLER_ASSIGNED" },
      orderBy: { updatedAt: "desc" },
      select: orderContentSelect,
    }),
    prisma.installationOrder.findMany({
      where: { currentInstallerId: installerId, status: "COMPLETED" },
      orderBy: { statusChangedAt: "desc" },
      take: 60,
      select: {
        ...orderContentSelect,
        statusChangedAt: true,
        completion: { select: { installEndAt: true } },
      },
    }),
    prisma.installationInstallerAssignmentAttempt.findMany({
      where: { installerId, status: { in: ["INSTALLER_REJECTED", "INSTALLER_RESPONSE_TIMED_OUT"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, status: true, installationOrder: { select: orderContentSelect } },
    }),
  ]);

  const pending: InstallerOrderItem[] = (pendingAttempts as Array<{ id: string; installationOrder: OrderContent }>)
    // Only the attempt the order is actually pointing at is actionable.
    .filter((a) => a.installationOrder.activeAssignmentId === a.id && a.installationOrder.status === "WAITING_INSTALLER_RESPONSE")
    .map((a) => shapeOrder(a.installationOrder, { attemptId: a.id, status: "PENDING", piiVisible: false }));

  const active: InstallerOrderItem[] = (activeOrders as OrderContent[]).map((o) =>
    shapeOrder(o, { attemptId: null, status: "ACCEPTED", piiVisible: true }),
  );

  const completed: InstallerOrderItem[] = (
    completedOrders as Array<OrderContent & { statusChangedAt: Date; completion: { installEndAt: Date } | null }>
  ).map((o) => {
    const base = shapeOrder(o, { attemptId: null, status: "COMPLETED", piiVisible: true });
    const dateSource = o.completion?.installEndAt ?? o.statusChangedAt;
    return { ...base, completedDate: toKstDateStr(dateSource) };
  });

  const history: InstallerOrderItem[] = (
    historyAttempts as Array<{ id: string; status: string; installationOrder: OrderContent }>
  ).map((a) =>
    shapeOrder(a.installationOrder, {
      attemptId: null,
      status: a.status === "INSTALLER_RESPONSE_TIMED_OUT" ? "TIMED_OUT" : "REJECTED",
      piiVisible: false,
    }),
  );

  return { pending, active, completed, history };
}

function toKstDateStr(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Single order for the detail / accept-reject page, scoped to this installer.
// Returns null if the order isn't the installer's (no attempt and not current).
export async function getInstallerOrderView(
  installerId: string,
  orderId: string,
): Promise<InstallerOrderItem | null> {
  const order = (await prisma.installationOrder.findUnique({
    where: { id: orderId },
    select: orderContentSelect,
  })) as OrderContent | null;
  if (!order) return null;

  // Accepted / in-progress job for this installer.
  if (order.currentInstallerId === installerId && order.status === "INSTALLER_ASSIGNED") {
    return shapeOrder(order, { attemptId: null, status: "ACCEPTED", piiVisible: true });
  }

  // Completed job for this installer.
  if (order.currentInstallerId === installerId && order.status === "COMPLETED") {
    return shapeOrder(order, { attemptId: null, status: "COMPLETED", piiVisible: true });
  }

  // Otherwise find this installer's most recent attempt on the order.
  const attempt = await prisma.installationInstallerAssignmentAttempt.findFirst({
    where: { installerId, installationOrderId: orderId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (!attempt) return null;

  const actionable =
    attempt.status === "WAITING_INSTALLER_RESPONSE" &&
    order.activeAssignmentId === attempt.id &&
    order.status === "WAITING_INSTALLER_RESPONSE";

  const status: InstallerOrderStatus = actionable
    ? "PENDING"
    : attempt.status === "INSTALLER_ACCEPTED"
      ? "ACCEPTED"
      : attempt.status === "INSTALLER_RESPONSE_TIMED_OUT"
        ? "TIMED_OUT"
        : "REJECTED";

  return shapeOrder(order, {
    attemptId: actionable ? attempt.id : null,
    status,
    piiVisible: status === "ACCEPTED",
  });
}
