import { prisma } from "@/lib/prisma";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { getCompletionPhotoSignedUrls, type CompletionPhoto } from "@/lib/installer/storage";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { sendSms } from "@/lib/sms";
import { createInstallSettlementSnapshot } from "@/lib/installation/settlement/snapshot";

export class InstallationCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationCompletionError";
  }
}

const ACHIEVED_CAPABILITIES = ["NONE", "DOORLOCK_AND_APP", "DOORLOCK_AND_APP_AND_HUB"] as const;
export type AchievedCapability = (typeof ACHIEVED_CAPABILITIES)[number];

export type SubmitCompletionInput = {
  installerId: string;
  orderId: string;
  achievedAqaraAppCapability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  /** 기타 청구. 금액이 없으면 사유·증빙은 무시된다. */
  extraClaimAmount?: number | null;
  extraClaimReason?: string | null;
  extraClaimPhotoPaths?: string[];
  installEndAt: Date;
  photoPaths: string[];
};

export const EXTRA_CLAIM_REASON_MAX_LENGTH = 500;
export const EXTRA_CLAIM_PHOTO_MAX = 4;

/**
 * 기타 청구 입력을 저장할 값으로 다듬는다.
 *
 * 금액이 없으면(0 포함) 청구 자체가 없는 것이므로 사유와 증빙을 버린다 — 금액 없는
 * 사유만 남으면 본사가 "얼마를 청구한 건지" 알 수 없다. 금액이 있으면 사유가
 * 반드시 있어야 한다. 증빙 사진은 선택이다.
 */
function normalizeExtraClaim(input: SubmitCompletionInput): {
  extraClaimAmount: number | null;
  extraClaimReason: string | null;
  extraClaimPhotoPaths: string[];
} {
  const amount = input.extraClaimAmount ?? null;
  if (amount === null || amount === 0) {
    return { extraClaimAmount: null, extraClaimReason: null, extraClaimPhotoPaths: [] };
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new InstallationCompletionError("EXTRA_CLAIM_AMOUNT_INVALID");
  }

  const reason = input.extraClaimReason?.trim() ?? "";
  if (!reason) throw new InstallationCompletionError("EXTRA_CLAIM_REASON_REQUIRED");
  if (reason.length > EXTRA_CLAIM_REASON_MAX_LENGTH) {
    throw new InstallationCompletionError("EXTRA_CLAIM_REASON_TOO_LONG");
  }

  const photoPaths = input.extraClaimPhotoPaths ?? [];
  if (photoPaths.length > EXTRA_CLAIM_PHOTO_MAX) {
    throw new InstallationCompletionError("EXTRA_CLAIM_PHOTO_COUNT_INVALID");
  }

  return { extraClaimAmount: amount, extraClaimReason: reason, extraClaimPhotoPaths: photoPaths };
}

export async function submitInstallerCompletion(input: SubmitCompletionInput): Promise<void> {
  const order = await prisma.installationOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, currentInstallerId: true, status: true },
  });
  if (!order || order.currentInstallerId !== input.installerId) {
    throw new InstallationCompletionError("NOT_YOUR_ORDER");
  }
  if (order.status !== INSTALLATION_ORDER_STATUSES.INSTALLER_ASSIGNED) {
    throw new InstallationCompletionError("ORDER_NOT_SUBMITTABLE");
  }
  if (!ACHIEVED_CAPABILITIES.includes(input.achievedAqaraAppCapability as AchievedCapability)) {
    throw new InstallationCompletionError("INVALID_CAPABILITY");
  }
  if (!(input.installEndAt instanceof Date) || Number.isNaN(input.installEndAt.getTime())) {
    throw new InstallationCompletionError("INSTALL_END_REQUIRED");
  }
  if (input.photoPaths.length < 1 || input.photoPaths.length > 4) {
    throw new InstallationCompletionError("PHOTO_COUNT_INVALID");
  }
  const extraClaim = normalizeExtraClaim(input);

  await prisma.$transaction(async (tx) => {
    await tx.installationCompletion.upsert({
      where: { installationOrderId: input.orderId },
      create: {
        installationOrderId: input.orderId,
        submittedInstallerId: input.installerId,
        achievedAqaraAppCapability: input.achievedAqaraAppCapability,
        wallpadLinked: input.wallpadLinked,
        wallpadAmount: input.wallpadAmount,
        longDistanceAmount: input.longDistanceAmount,
        ...extraClaim,
        installEndAt: input.installEndAt,
        photoPaths: input.photoPaths,
        reviewStatus: "PENDING",
      },
      update: {
        submittedInstallerId: input.installerId,
        submittedAt: new Date(),
        achievedAqaraAppCapability: input.achievedAqaraAppCapability,
        wallpadLinked: input.wallpadLinked,
        wallpadAmount: input.wallpadAmount,
        longDistanceAmount: input.longDistanceAmount,
        // 재제출은 기타 청구도 통째로 바꾼다. 이번에 비워서 올렸으면 청구를 철회한 것이다.
        ...extraClaim,
        // installEndAt 은 덮어쓰지 않는다. 이제 기사가 입력하는 값이 아니라 제출
        // 시각이라, 반려 후 재제출 때 바꾸면 설치일과 정산 월이 재제출일로 밀린다.
        photoPaths: input.photoPaths,
        reviewStatus: "PENDING",
        reviewedByAdminId: null,
        reviewedAt: null,
        rejectionReason: null,
      },
    });

    await transitionInstallationOrderStatus(
      input.orderId,
      INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW,
      {
        event: {
          eventType: "INSTALLER_SUBMITTED_COMPLETION",
          actorType: "INSTALLER",
          actorId: input.installerId,
          metadata: {
            achievedAqaraAppCapability: input.achievedAqaraAppCapability,
            wallpadLinked: input.wallpadLinked,
          },
        },
      },
      tx as never,
    );
  });
}

export async function approveInstallerCompletion(input: {
  adminId: string;
  orderId: string;
  // Admin may set/adjust the installer-declared long-distance fee at review
  // time (§6.4 장거리: installer fills → admin confirms). Frozen into snapshot.
  longDistanceAmount?: number | null;
  // 기타 청구도 같은 방식이다: 기사가 올린 금액을 본사가 승인 시점에 확정한다.
  // 0 이나 null 로 승인하면 그 청구는 인정하지 않은 것이다.
  extraClaimAmount?: number | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, activeAssignmentId: true },
    });
    if (!order) throw new InstallationCompletionError("ORDER_NOT_FOUND");
    if (order.status !== INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW) {
      throw new InstallationCompletionError("ORDER_NOT_IN_REVIEW");
    }

    if (order.activeAssignmentId) {
      await tx.installationInstallerAssignmentAttempt.updateMany({
        where: { id: order.activeAssignmentId, status: "INSTALLER_ACCEPTED" },
        data: { status: "ADMIN_COMPLETED" },
      });
    }

    await tx.installationCompletion.update({
      where: { installationOrderId: input.orderId },
      data: {
        reviewStatus: "APPROVED",
        reviewedByAdminId: input.adminId,
        reviewedAt: new Date(),
        rejectionReason: null,
        ...(input.longDistanceAmount === undefined
          ? {}
          : { longDistanceAmount: input.longDistanceAmount }),
        ...(input.extraClaimAmount === undefined
          ? {}
          : { extraClaimAmount: input.extraClaimAmount }),
      },
    });

    // §8.5 M1: freeze the settlement snapshot at approval time.
    await createInstallSettlementSnapshot(tx, {
      orderId: input.orderId,
      adminId: input.adminId,
    });

    await transitionInstallationOrderStatus(
      input.orderId,
      INSTALLATION_ORDER_STATUSES.COMPLETED,
      {
        orderData: { activeAssignmentId: null },
        event: {
          eventType: "ADMIN_APPROVED_COMPLETION",
          actorType: "ADMIN",
          actorId: input.adminId,
        },
      },
      tx as never,
    );
  });
}

export async function rejectInstallerCompletion(input: {
  adminId: string;
  orderId: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new InstallationCompletionError("REJECTION_REASON_REQUIRED");

  const installerId = await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, currentInstallerId: true },
    });
    if (!order) throw new InstallationCompletionError("ORDER_NOT_FOUND");
    if (order.status !== INSTALLATION_ORDER_STATUSES.WAITING_HQ_REVIEW) {
      throw new InstallationCompletionError("ORDER_NOT_IN_REVIEW");
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
        event: {
          eventType: "ADMIN_REJECTED_COMPLETION",
          actorType: "ADMIN",
          actorId: input.adminId,
          reason,
        },
      },
      tx as never,
    );

    return order.currentInstallerId;
  });

  // Best-effort notify the installer (push + SMS fallback) so a rejection isn't
  // silently sitting in the app.
  if (installerId) {
    await notifyInstallerOfCompletionRejection(installerId, reason);
  }
}

async function notifyInstallerOfCompletionRejection(installerId: string, reason: string) {
  const shortReason = reason.length > 40 ? `${reason.slice(0, 40)}…` : reason;

  try {
    await sendAssignmentPushToInstaller(installerId, {
      title: "완료 등록이 반려되었습니다",
      body: `사유: ${shortReason}`,
    });
  } catch (error) {
    console.error("[installer/completion/reject-push]", error);
  }

  try {
    const installer = await prisma.installer.findUnique({
      where: { id: installerId },
      select: { phone: true },
    });
    if (installer?.phone) {
      await sendSms(
        installer.phone,
        `[Aqara 기사] 완료 등록이 반려되었습니다.\n사유: ${shortReason}\n앱에서 다시 등록해 주세요.`,
      );
    }
  } catch (error) {
    console.error("[installer/completion/reject-sms]", error);
  }
}

export type InstallationCompletionView = {
  submittedAt: string;
  /** 처음 제출된 시각 (재제출해도 바뀌지 않는다) */
  firstSubmittedAt: string;
  achievedAqaraAppCapability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  extraClaimAmount: number | null;
  extraClaimReason: string | null;
  extraClaimPhotos: CompletionPhoto[];
  installEndAt: string;
  reviewStatus: string;
  rejectionReason: string | null;
  photos: CompletionPhoto[];
};

export async function getInstallationCompletionForOrder(
  orderId: string,
): Promise<InstallationCompletionView | null> {
  const c = await prisma.installationCompletion.findUnique({
    where: { installationOrderId: orderId },
  });
  if (!c) return null;

  return {
    submittedAt: c.submittedAt.toISOString(),
    firstSubmittedAt: c.createdAt.toISOString(),
    achievedAqaraAppCapability: c.achievedAqaraAppCapability,
    wallpadLinked: c.wallpadLinked,
    wallpadAmount: c.wallpadAmount,
    longDistanceAmount: c.longDistanceAmount,
    extraClaimAmount: c.extraClaimAmount,
    extraClaimReason: c.extraClaimReason,
    extraClaimPhotos: await getCompletionPhotoSignedUrls(c.extraClaimPhotoPaths),
    installEndAt: c.installEndAt.toISOString(),
    reviewStatus: c.reviewStatus,
    rejectionReason: c.rejectionReason,
    photos: await getCompletionPhotoSignedUrls(c.photoPaths),
  };
}
