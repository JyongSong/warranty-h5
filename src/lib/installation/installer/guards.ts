import { prisma } from "@/lib/prisma";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { respondInstallerAssignment } from "@/lib/installation/installer/response";

type GuardOptions = {
  now?: Date;
  limit?: number;
};

export async function timeoutExpiredInstallerAssignments({
  now = new Date(),
  limit = 25,
}: GuardOptions = {}) {
  const assignments = await prisma.installationInstallerAssignmentAttempt.findMany({
    where: {
      status: "WAITING_INSTALLER_RESPONSE",
      installerTokenExpiresAt: { lt: now },
    },
    orderBy: { installerTokenExpiresAt: "asc" },
    take: limit,
    select: {
      id: true,
      installationOrderId: true,
      installerTokenHash: true,
    },
  });

  let timedOutCount = 0;
  let failedCount = 0;

  for (const assignment of assignments) {
    if (!assignment.installerTokenHash) {
      await createTimeoutProcessingIssue(
        assignment.installationOrderId,
        assignment.id,
        "INSTALLER_TOKEN_HASH_MISSING",
        now,
      );
      failedCount += 1;
      continue;
    }

    try {
      await respondInstallerAssignment(assignment.installerTokenHash, {
        response: "REJECT",
        rejectReason: "INSTALLER_RESPONSE_TIMEOUT",
        now,
        tokenIsHash: true,
      });
      timedOutCount += 1;
    } catch (error) {
      await createTimeoutProcessingIssue(
        assignment.installationOrderId,
        assignment.id,
        error instanceof Error ? error.message : "INSTALLER_TIMEOUT_PROCESSING_FAILED",
        now,
      );
      failedCount += 1;
    }
  }

  return { timedOutCount, failedCount };
}

export async function alertOrphanedInstallationOrders({
  now = new Date(),
  limit = 50,
}: GuardOptions = {}) {
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const orders = await prisma.installationOrder.findMany({
    where: {
      status: "WAITING_INSTALLER_RESPONSE",
      hasOpenIssue: false,
      statusChangedAt: { lt: staleBefore },
    },
    orderBy: { statusChangedAt: "asc" },
    take: limit,
    select: {
      id: true,
      status: true,
      activeAssignmentId: true,
      activeAssignment: {
        select: {
          id: true,
          status: true,
          installerTokenExpiresAt: true,
          notifications: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true },
          },
        },
      },
    },
  });

  let issueCount = 0;
  for (const order of orders) {
    const assignment = order.activeAssignment;
    const notification = assignment?.notifications[0] ?? null;
    const hasValidWait = Boolean(
      assignment &&
      order.activeAssignmentId === assignment.id &&
      ((assignment.status === "WAITING_INSTALLER_RESPONSE" && assignment.installerTokenExpiresAt) ||
        (assignment.status === "SYSTEM_SMS_RETRY_PENDING" && notification?.status === "PENDING")),
    );
    if (hasValidWait) continue;

    await createInstallationIssue({
      installationOrderId: order.id,
      type: "INSTALLATION_WORKFLOW_ORPHANED",
      title: "설치 업무 흐름 중단 감지",
      description: "기사 응답 대기 상태에 유효한 배정 요청 또는 종료 시각이 없어 관리자 확인이 필요합니다.",
      metadata: {
        status: order.status,
        activeAssignmentId: order.activeAssignmentId,
        assignmentStatus: assignment?.status ?? null,
        notificationId: notification?.id ?? null,
        notificationStatus: notification?.status ?? null,
      },
      now,
    });
    issueCount += 1;
  }

  return { issueCount };
}

async function createTimeoutProcessingIssue(
  installationOrderId: string,
  assignmentId: string,
  error: string,
  now: Date,
) {
  await createInstallationIssue({
    installationOrderId,
    type: "INSTALLATION_AUTOMATION_FAILED",
    title: "기사 응답 timeout 처리 실패",
    description: error,
    metadata: {
      stage: "INSTALLER_RESPONSE_TIMEOUT",
      assignmentId,
    },
    now,
  });
}

export async function alertDueSoonUnassignedOrders({
  now = new Date(),
  limit = 50,
}: GuardOptions = {}) {
  const threshold = getDueSoonThresholdDateString(now);
  const orders = await prisma.installationOrder.findMany({
    where: {
      status: {
        in: ["READY_FOR_CANDIDATE_SELECTION", "WAITING_ADMIN_REVIEW", "WAITING_INSTALLER_RESPONSE"],
      },
      customerRequests: {
        some: {
          status: { in: ["SUBMITTED", "FALLBACK_USED"] },
          installDate: { lte: threshold },
        },
      },
    },
    orderBy: { statusChangedAt: "asc" },
    take: limit,
    select: {
      id: true,
      status: true,
      customerRequests: {
        where: {
          status: { in: ["SUBMITTED", "FALLBACK_USED"] },
          installDate: { lte: threshold },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          installDate: true,
        },
      },
    },
  });

  let issueCount = 0;

  for (const order of orders) {
    const installDate = order.customerRequests[0]?.installDate ?? null;
    await createInstallationIssue({
      installationOrderId: order.id,
      type: "INSTALLER_NOT_ASSIGNED",
      title: "설치 일정 임박",
      description: "설치 희망일 전까지 기사 배정 또는 완료가 확정되지 않았습니다.",
      metadata: {
        installDate,
        status: order.status,
      },
      now,
    });
    issueCount += 1;
  }

  return { issueCount };
}

function getDueSoonThresholdDateString(now: Date) {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const daysAhead = kstNow.getUTCHours() >= 9 ? 1 : 0;
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + daysAhead),
  )
    .toISOString()
    .slice(0, 10);
}
