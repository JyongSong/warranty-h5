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
      installerTokenHash: true,
    },
  });

  let timedOutCount = 0;
  let failedCount = 0;

  for (const assignment of assignments) {
    if (!assignment.installerTokenHash) {
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
    } catch {
      failedCount += 1;
    }
  }

  return { timedOutCount, failedCount };
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
