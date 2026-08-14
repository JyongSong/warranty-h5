import { prisma } from "@/lib/prisma";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { getCompletionPhotoSignedUrls } from "@/lib/installer/storage";
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
  installEndAt: Date;
  photoPaths: string[];
};

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
        installEndAt: input.installEndAt,
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
  achievedAqaraAppCapability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  installEndAt: string;
  reviewStatus: string;
  rejectionReason: string | null;
  photoUrls: string[];
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
    achievedAqaraAppCapability: c.achievedAqaraAppCapability,
    wallpadLinked: c.wallpadLinked,
    wallpadAmount: c.wallpadAmount,
    longDistanceAmount: c.longDistanceAmount,
    installEndAt: c.installEndAt.toISOString(),
    reviewStatus: c.reviewStatus,
    rejectionReason: c.rejectionReason,
    photoUrls: await getCompletionPhotoSignedUrls(c.photoPaths),
  };
}
