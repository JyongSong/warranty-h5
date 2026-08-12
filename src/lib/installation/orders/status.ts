import { prisma } from "@/lib/prisma";

export const INSTALLATION_ORDER_STATUSES = {
  CUSTOMER_INPUT_SMS_REQUIRED: "CUSTOMER_INPUT_SMS_REQUIRED",
  WAITING_CUSTOMER_INPUT: "WAITING_CUSTOMER_INPUT",
  READY_FOR_CANDIDATE_SELECTION: "READY_FOR_CANDIDATE_SELECTION",
  WAITING_ADMIN_REVIEW: "WAITING_ADMIN_REVIEW",
  WAITING_INSTALLER_RESPONSE: "WAITING_INSTALLER_RESPONSE",
  INSTALLER_ASSIGNED: "INSTALLER_ASSIGNED",
  WAITING_HQ_REVIEW: "WAITING_HQ_REVIEW",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;

export type InstallationOrderStatus =
  (typeof INSTALLATION_ORDER_STATUSES)[keyof typeof INSTALLATION_ORDER_STATUSES];

type TransitionContext = {
  now?: Date;
  orderData?: Record<string, unknown>;
  event?: {
    eventType: string;
    actorType: string;
    actorId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  };
};

type InstallationOrderTransaction = {
  installationOrder: {
    findUnique: (args: unknown) => Promise<{ id: string; status: string } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  installationOrderStatusEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
  installationIssue?: {
    updateMany: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
};

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  CUSTOMER_INPUT_SMS_REQUIRED: ["WAITING_CUSTOMER_INPUT", "CANCELLED", "COMPLETED"],
  WAITING_CUSTOMER_INPUT: ["WAITING_CUSTOMER_INPUT", "READY_FOR_CANDIDATE_SELECTION", "CANCELLED", "COMPLETED"],
  READY_FOR_CANDIDATE_SELECTION: [
    "WAITING_ADMIN_REVIEW",
    "WAITING_INSTALLER_RESPONSE",
    "READY_FOR_CANDIDATE_SELECTION",
    "CANCELLED",
    "COMPLETED",
  ],
  WAITING_ADMIN_REVIEW: [
    "WAITING_INSTALLER_RESPONSE",
    "READY_FOR_CANDIDATE_SELECTION",
    "WAITING_ADMIN_REVIEW",
    "CANCELLED",
    "COMPLETED",
  ],
  WAITING_INSTALLER_RESPONSE: [
    "READY_FOR_CANDIDATE_SELECTION",
    "WAITING_INSTALLER_RESPONSE",
    "INSTALLER_ASSIGNED",
    "CANCELLED",
    "COMPLETED",
  ],
  INSTALLER_ASSIGNED: ["WAITING_HQ_REVIEW", "CANCELLED", "COMPLETED"],
  WAITING_HQ_REVIEW: ["INSTALLER_ASSIGNED", "COMPLETED", "CANCELLED"],
  CANCELLED: ["COMPLETED"],
  COMPLETED: ["COMPLETED"],
};

export async function transitionInstallationOrderStatus(
  orderId: string,
  nextStatus: InstallationOrderStatus,
  context: TransitionContext,
  tx?: InstallationOrderTransaction,
) {
  if (tx) {
    return transitionInstallationOrderStatusInTx(tx, orderId, nextStatus, context);
  }

  return prisma.$transaction((transaction) =>
    transitionInstallationOrderStatusInTx(
      transaction as unknown as InstallationOrderTransaction,
      orderId,
      nextStatus,
      context,
    ),
  );
}

async function transitionInstallationOrderStatusInTx(
  tx: InstallationOrderTransaction,
  orderId: string,
  nextStatus: InstallationOrderStatus,
  context: TransitionContext,
) {
  const current = await tx.installationOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });

  if (!current) {
    throw new Error("INSTALLATION_ORDER_NOT_FOUND");
  }

  const allowedNextStatuses = ALLOWED_TRANSITIONS[current.status] ?? [];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new Error("INVALID_INSTALLATION_ORDER_STATUS_TRANSITION");
  }

  const now = context.now ?? new Date();
  await tx.installationOrder.update({
    where: { id: orderId },
    data: {
      ...(context.orderData ?? {}),
      status: nextStatus,
      statusChangedAt: now,
    },
  });

  if (shouldResolveIssues(nextStatus)) {
    if (!tx.installationIssue) {
      throw new Error("INSTALLATION_ISSUE_MODEL_MISSING");
    }

    if (isTerminalStatus(nextStatus)) {
      await tx.installationIssue.updateMany({
        where: { installationOrderId: orderId, status: "OPEN" },
        data: {
          status: "RESOLVED",
          resolvedAt: now,
          resolutionNote: `설치건 상태가 ${nextStatus}로 전환되어 남은 예외를 종결했습니다.`,
          updatedAt: now,
        },
      });
    } else {
      await tx.installationIssue.updateMany({
        where: {
          installationOrderId: orderId,
          type: "INSTALLER_NOT_ASSIGNED",
          status: "OPEN",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: now,
          resolutionNote: `설치건 상태가 ${nextStatus}로 전환되어 일정 임박 예외를 해결했습니다.`,
          updatedAt: now,
        },
      });
      await tx.installationIssue.updateMany({
        where: {
          installationOrderId: orderId,
          type: {
            in: [
              "INSTALLER_CANDIDATE_NOT_FOUND",
              "INSTALLER_CANDIDATE_EXHAUSTED",
            ],
          },
          status: "OPEN",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: now,
          resolutionNote: `설치건 상태가 ${nextStatus}로 전환되어 배정 예외를 해결했습니다.`,
          updatedAt: now,
        },
      });
    }

    const remainingOpenIssueCount = await tx.installationIssue.count({
      where: {
        installationOrderId: orderId,
        status: "OPEN",
      },
    });

    if (remainingOpenIssueCount === 0) {
      await tx.installationOrder.update({
        where: { id: orderId },
        data: { hasOpenIssue: false },
      });
    }
  }

  if (context.event) {
    if (!tx.installationOrderStatusEvent) {
      throw new Error("INSTALLATION_ORDER_STATUS_EVENT_MODEL_MISSING");
    }

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: orderId,
        fromStatus: current.status,
        toStatus: nextStatus,
        eventType: context.event.eventType,
        actorType: context.event.actorType,
        actorId: context.event.actorId ?? null,
        reason: context.event.reason ?? null,
        metadata: context.event.metadata ?? {},
        createdAt: now,
      },
    });
  }
}

function shouldResolveIssues(status: InstallationOrderStatus) {
  const issueResolvingStatuses: readonly InstallationOrderStatus[] = [
    INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED,
    INSTALLATION_ORDER_STATUSES.CANCELLED,
    INSTALLATION_ORDER_STATUSES.COMPLETED,
  ];
  return issueResolvingStatuses.includes(status);
}

function isTerminalStatus(status: InstallationOrderStatus) {
  return status === INSTALLATION_ORDER_STATUSES.CANCELLED || status === INSTALLATION_ORDER_STATUSES.COMPLETED;
}
