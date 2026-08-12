import { prisma } from "@/lib/prisma";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { getCompletionPhotoSignedUrls } from "@/lib/installer/storage";

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
      },
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

  await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true },
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
  });
}

export type InstallationCompletionView = {
  submittedAt: string;
  achievedAqaraAppCapability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
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
    installEndAt: c.installEndAt.toISOString(),
    reviewStatus: c.reviewStatus,
    rejectionReason: c.rejectionReason,
    photoUrls: await getCompletionPhotoSignedUrls(c.photoPaths),
  };
}
