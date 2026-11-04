import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import {
  rebuildInstallSettlementSnapshot,
  removeInstallSettlementSnapshot,
  SettlementSnapshotLockedError,
} from "@/lib/installation/settlement/snapshot";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { sendSms } from "@/lib/sms";
import {
  fillCompletionCaseSiteName,
  recordCompletionWallpadCase,
  removeCompletionWallpadCase,
} from "@/lib/installation/wallpad/service";
import { EXTRA_CLAIM_REASON_MAX_LENGTH, InstallationCompletionError } from "./service";

const ACHIEVED_CAPABILITIES = ["NONE", "DOORLOCK_AND_APP", "DOORLOCK_AND_APP_AND_HUB"];

async function getApprovedCompletionOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.installationOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, currentInstallerId: true },
  });
  if (!order) throw new InstallationCompletionError("ORDER_NOT_FOUND");
  if (order.status !== INSTALLATION_ORDER_STATUSES.COMPLETED) {
    throw new InstallationCompletionError("ORDER_NOT_COMPLETED");
  }
  const completion = await tx.installationCompletion.findUnique({ where: { installationOrderId: orderId } });
  if (!completion || completion.reviewStatus !== "APPROVED") {
    // 관리자 직접 완료 처리 건이나 협력사 건은 기사 완료 등록이 없어 여기서 다루지 않는다.
    throw new InstallationCompletionError("COMPLETION_NOT_APPROVED");
  }
  return { order, completion };
}

/**
 * 승인된 설치 완료를 취소하고 기사에게 다시 제출하게 한다.
 * - 주문: 설치 완료 → 기사 배정 완료(기사가 완료 등록을 다시 할 수 있는 상태)
 * - 완료 등록: 반려 상태로 돌리고 사유를 남긴다(기사 앱에 반려 사유가 보인다).
 * - 배정: 관리자 완료 → 기사 수락으로 되살린다.
 * - 정산: 승인 때 확정한 금액을 지운다. 정산이 끝난 기간에 들어간 건은 막는다.
 */
export async function revertApprovedCompletion(input: {
  adminId: string;
  orderId: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new InstallationCompletionError("REVERT_REASON_REQUIRED");

  const installerId = await prisma.$transaction(async (tx) => {
    const { order, completion } = await getApprovedCompletionOrder(tx, input.orderId);
    const installerId = order.currentInstallerId ?? completion.submittedInstallerId;

    // 다시 승인되면 그때 사례를 새로 남긴다.
    await removeCompletionWallpadCase(tx, input.orderId);

    try {
      await removeInstallSettlementSnapshot(tx, input.orderId);
    } catch (error) {
      if (error instanceof SettlementSnapshotLockedError) {
        throw new InstallationCompletionError("SETTLEMENT_PERIOD_NOT_OPEN");
      }
      throw error;
    }

    // 승인 때 ADMIN_COMPLETED 로 닫은 배정을 되살린다.
    const attempt = await tx.installationInstallerAssignmentAttempt.findFirst({
      where: {
        installationOrderId: input.orderId,
        status: "ADMIN_COMPLETED",
        ...(installerId ? { installerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (attempt) {
      await tx.installationInstallerAssignmentAttempt.update({
        where: { id: attempt.id },
        data: { status: "INSTALLER_ACCEPTED" },
      });
    }

    await tx.installationCompletion.update({
      where: { installationOrderId: input.orderId },
      data: {
        reviewStatus: "REJECTED",
        reviewedByAdminId: input.adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await transitionInstallationOrderStatus(
      input.orderId,
      INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED,
      {
        orderData: {
          activeAssignmentId: attempt?.id ?? null,
          ...(installerId && !order.currentInstallerId ? { currentInstallerId: installerId } : {}),
        },
        event: {
          eventType: "ADMIN_REVERTED_COMPLETION",
          actorType: "ADMIN",
          actorId: input.adminId,
          reason,
        },
      },
      tx as never,
    );

    return installerId;
  });

  if (installerId) await notifyInstallerOfRevert(installerId, reason);
}

export type ApprovedCompletionEditInput = {
  adminId: string;
  orderId: string;
  reason: string;
  achievedAqaraAppCapability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  extraClaimAmount: number | null;
  extraClaimReason: string | null;
};

/**
 * 승인된 설치 완료의 내용(연동 결과·월패드·장거리·기타 청구)을 관리자가 고치고
 * 정산 금액을 다시 확정한다. 정산이 끝난 기간에 들어간 건은 막는다.
 */
export async function editApprovedCompletion(input: ApprovedCompletionEditInput): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new InstallationCompletionError("EDIT_REASON_REQUIRED");
  if (!ACHIEVED_CAPABILITIES.includes(input.achievedAqaraAppCapability)) {
    throw new InstallationCompletionError("INVALID_CAPABILITY");
  }
  for (const value of [input.wallpadAmount, input.longDistanceAmount, input.extraClaimAmount]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new InstallationCompletionError("INVALID_AMOUNT");
    }
  }
  const wallpadAmount = input.wallpadLinked ? input.wallpadAmount : null;
  const extraClaimAmount = input.extraClaimAmount ? input.extraClaimAmount : null;
  const extraClaimReason = extraClaimAmount ? input.extraClaimReason?.trim() || null : null;
  if (extraClaimAmount && !extraClaimReason) {
    throw new InstallationCompletionError("EXTRA_CLAIM_REASON_REQUIRED");
  }
  if (extraClaimReason && extraClaimReason.length > EXTRA_CLAIM_REASON_MAX_LENGTH) {
    throw new InstallationCompletionError("EXTRA_CLAIM_REASON_TOO_LONG");
  }

  const caseNeedingSiteName = await prisma.$transaction(async (tx) => {
    const { order, completion } = await getApprovedCompletionOrder(tx, input.orderId);

    const before = {
      achievedAqaraAppCapability: completion.achievedAqaraAppCapability,
      wallpadLinked: completion.wallpadLinked,
      wallpadAmount: completion.wallpadAmount,
      longDistanceAmount: completion.longDistanceAmount,
      extraClaimAmount: completion.extraClaimAmount,
      extraClaimReason: completion.extraClaimReason,
    };
    const after = {
      achievedAqaraAppCapability: input.achievedAqaraAppCapability,
      wallpadLinked: input.wallpadLinked,
      wallpadAmount,
      longDistanceAmount: input.longDistanceAmount,
      extraClaimAmount,
      extraClaimReason,
    };
    const changes = (Object.keys(after) as Array<keyof typeof after>)
      .filter((key) => (before[key] ?? null) !== (after[key] ?? null))
      .map((key) => ({ field: key, from: before[key] ?? null, to: after[key] ?? null }));
    if (changes.length === 0) throw new InstallationCompletionError("NOTHING_CHANGED");

    // 월패드 연동 결과도 체크와 맞춘다. 연동함 → 성공. 연동 안 함으로 바꾸면 성공이던 건만 "안 함" 이 되고,
    // 실패로 남긴 건은 그대로 둔다(실패도 연동하지 않은 것이다). 옛 제출(결과 없음)은 그대로 비워 둔다.
    const wallpadChanged = before.wallpadLinked !== after.wallpadLinked;
    const wallpadResult = !wallpadChanged
      ? completion.wallpadResult
      : after.wallpadLinked
        ? "SUCCESS"
        : completion.wallpadResult === "SUCCESS"
          ? "NOT_ATTEMPTED"
          : completion.wallpadResult;
    const keepWallpadPhotos = after.wallpadLinked || wallpadResult === "FAIL";

    await tx.installationCompletion.update({
      where: { installationOrderId: input.orderId },
      data: {
        ...after,
        ...(wallpadChanged ? { wallpadResult } : {}),
        // 연동/월패드를 없음으로 바꾸면 그 증빙 사진도 의미가 없다. 기사 제출 때와 같은 규칙.
        ...(after.achievedAqaraAppCapability === "NONE" ? { linkagePhotoPaths: [] } : {}),
        ...(keepWallpadPhotos ? {} : { wallpadPhotoPaths: [] }),
        ...(extraClaimAmount ? {} : { extraClaimPhotoPaths: [] }),
      },
    });

    // 월패드 결과가 바뀐 때만 현장 사례를 다시 남긴다. 관리자가 호환 DB 에서 고친 단지명을 덮지 않게.
    const wallpadCaseId = wallpadChanged ? await recordCompletionWallpadCase(tx, input.orderId) : null;

    try {
      await rebuildInstallSettlementSnapshot(tx, { orderId: input.orderId, adminId: input.adminId });
    } catch (error) {
      if (error instanceof SettlementSnapshotLockedError) {
        throw new InstallationCompletionError("SETTLEMENT_PERIOD_NOT_OPEN");
      }
      throw error;
    }

    // 상태는 그대로(설치 완료). statusChangedAt 을 바꾸지 않게 이력만 직접 남긴다.
    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        eventType: "ADMIN_EDITED_COMPLETION",
        actorType: "ADMIN",
        actorId: input.adminId,
        reason,
        metadata: { changes },
      },
    });

    return wallpadCaseId;
  });

  if (caseNeedingSiteName) await fillCompletionCaseSiteName(caseNeedingSiteName);
}

async function notifyInstallerOfRevert(installerId: string, reason: string) {
  const shortReason = reason.length > 40 ? `${reason.slice(0, 40)}…` : reason;

  try {
    await sendAssignmentPushToInstaller(installerId, {
      title: "완료 승인이 취소되었습니다",
      body: `사유: ${shortReason}`,
    });
  } catch (error) {
    console.error("[installer/completion/revert-push]", error);
  }

  try {
    const installer = await prisma.installer.findUnique({
      where: { id: installerId },
      select: { phone: true },
    });
    if (installer?.phone) {
      await sendSms(
        installer.phone,
        `[Aqara 기사] 설치 완료 승인이 취소되었습니다.\n사유: ${shortReason}\n앱에서 완료 등록을 다시 해 주세요.`,
      );
    }
  } catch (error) {
    console.error("[installer/completion/revert-sms]", error);
  }
}
