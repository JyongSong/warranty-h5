import { prisma } from "@/lib/prisma";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { getCompletionPhotoSignedUrls, type CompletionPhoto } from "@/lib/installer/storage";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { sendSms } from "@/lib/sms";
import { createInstallSettlementSnapshot } from "@/lib/installation/settlement/snapshot";
import { WALLPAD_BILLINGS } from "@/lib/installation/settlement/compute";
import {
  WALLPAD_BRANDS,
  WALLPAD_FAIL_REASONS,
  WALLPAD_MODEL_MAX_LENGTH,
  WALLPAD_NOTE_MAX_LENGTH,
  WALLPAD_RESULTS,
  isOneOf,
} from "@/lib/installation/wallpad/constants";
import {
  fillCompletionCaseSiteName,
  recordCompletionWallpadCase,
} from "@/lib/installation/wallpad/service";

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
  /**
   * 앱/허브 연동 화면 사진. 연동을 골랐으면 1장 이상 있어야 한다.
   * undefined 는 이 항목이 생기기 전 화면(또는 그때 대기열에 들어간 건)에서 온 제출이라
   * 필수 검사를 하지 않는다 — 그때는 연동 사진을 설치 사진에 섞어 올렸다.
   */
  linkagePhotoPaths?: string[];
  /** 월패드 사진(선택). 월패드 연동을 시도하지 않았으면 버린다. */
  wallpadPhotoPaths?: string[];
  /**
   * 월패드 연동 결과. undefined 는 이 항목이 생기기 전 화면(또는 그때 대기열에 들어간 건)에서 온
   * 제출이라 wallpadLinked 만 받는다. 값이 있으면 wallpadLinked 는 결과에서 다시 정한다.
   */
  wallpadResult?: string;
  wallpadBrand?: string | null;
  wallpadModel?: string | null;
  wallpadFailReason?: string | null;
  wallpadNote?: string | null;
  /**
   * 월패드 연동 성공 건의 결제 방식(HQ 본사 청구 / ONSITE 현장 결제). 성공이 아니면 버린다.
   * 없으면(이 항목이 생기기 전 화면·대기열) 현장 결제로 본다.
   */
  wallpadBilling?: string | null;
  installEndAt: Date;
  photoPaths: string[];
};

export const EXTRA_CLAIM_REASON_MAX_LENGTH = 500;
export const EXTRA_CLAIM_PHOTO_MAX = 4;
export const LINKAGE_PHOTO_MAX = 4;
export const WALLPAD_PHOTO_MAX = 4;

/** 연동 사진·월패드 사진을 저장할 값으로 다듬는다. 해당 항목을 안 골랐으면 사진도 버린다. */
function normalizeOptionPhotos(input: SubmitCompletionInput): {
  linkagePhotoPaths: string[];
  wallpadPhotoPaths: string[];
} {
  const linked = input.achievedAqaraAppCapability !== "NONE";
  const linkagePhotoPaths = linked ? (input.linkagePhotoPaths ?? []) : [];
  if (linked && input.linkagePhotoPaths !== undefined && linkagePhotoPaths.length < 1) {
    throw new InstallationCompletionError("LINKAGE_PHOTO_REQUIRED");
  }
  if (linkagePhotoPaths.length > LINKAGE_PHOTO_MAX) {
    throw new InstallationCompletionError("LINKAGE_PHOTO_COUNT_INVALID");
  }

  // 실패한 경우도 월패드 사진을 남긴다. 어떤 모델이었는지 나중에 확인할 근거다.
  const wallpadAttempted =
    input.wallpadResult === undefined ? input.wallpadLinked : input.wallpadResult !== "NOT_ATTEMPTED";
  const wallpadPhotoPaths = wallpadAttempted ? (input.wallpadPhotoPaths ?? []) : [];
  if (wallpadPhotoPaths.length > WALLPAD_PHOTO_MAX) {
    throw new InstallationCompletionError("WALLPAD_PHOTO_COUNT_INVALID");
  }

  return { linkagePhotoPaths, wallpadPhotoPaths };
}

/**
 * 월패드 연동 결과를 저장할 값으로 다듬는다.
 *
 * 제조사·모델명·실패 사유는 모두 선택이다(기사가 모를 수 있다). 적었으면 정해진 값인지만 본다.
 * 현장 금액은 성공했을 때만 남긴다. 옛 제출(결과 없음)은 wallpadLinked 를 그대로 쓴다.
 * 성공 건은 결제 방식을 남기고, 본사 청구면 금액이 고정이라 현장 금액을 버린다.
 */
function normalizeWallpad(input: SubmitCompletionInput): {
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  wallpadBilling: string | null;
  wallpadResult: string | null;
  wallpadBrand: string | null;
  wallpadModel: string | null;
  wallpadFailReason: string | null;
  wallpadNote: string | null;
} {
  if (input.wallpadResult === undefined) {
    return {
      wallpadLinked: input.wallpadLinked,
      wallpadAmount: input.wallpadAmount,
      wallpadBilling: null,
      wallpadResult: null,
      wallpadBrand: null,
      wallpadModel: null,
      wallpadFailReason: null,
      wallpadNote: null,
    };
  }
  const result = input.wallpadResult;
  if (!isOneOf(WALLPAD_RESULTS, result)) throw new InstallationCompletionError("WALLPAD_RESULT_INVALID");
  if (result === "NOT_ATTEMPTED") {
    return {
      wallpadLinked: false,
      wallpadAmount: null,
      wallpadBilling: null,
      wallpadResult: result,
      wallpadBrand: null,
      wallpadModel: null,
      wallpadFailReason: null,
      wallpadNote: null,
    };
  }

  const brand = input.wallpadBrand?.trim() || null;
  if (brand && !isOneOf(WALLPAD_BRANDS, brand)) throw new InstallationCompletionError("WALLPAD_BRAND_INVALID");
  const model = input.wallpadModel?.trim() || null;
  if (model && model.length > WALLPAD_MODEL_MAX_LENGTH) {
    throw new InstallationCompletionError("WALLPAD_MODEL_TOO_LONG");
  }
  const note = input.wallpadNote?.trim() || null;
  if (note && note.length > WALLPAD_NOTE_MAX_LENGTH) {
    throw new InstallationCompletionError("WALLPAD_NOTE_TOO_LONG");
  }
  const failReason = result === "FAIL" ? input.wallpadFailReason?.trim() || null : null;
  if (failReason && !isOneOf(WALLPAD_FAIL_REASONS, failReason)) {
    throw new InstallationCompletionError("WALLPAD_FAIL_REASON_INVALID");
  }

  const success = result === "SUCCESS";
  const billing = success ? (input.wallpadBilling ?? "ONSITE") : null;
  if (billing && !isOneOf(WALLPAD_BILLINGS, billing)) {
    throw new InstallationCompletionError("WALLPAD_BILLING_INVALID");
  }

  return {
    wallpadLinked: success,
    wallpadAmount: success && billing === "ONSITE" ? input.wallpadAmount : null,
    wallpadBilling: billing,
    wallpadResult: result,
    wallpadBrand: brand,
    wallpadModel: model,
    wallpadFailReason: failReason,
    wallpadNote: note,
  };
}

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
  const optionPhotos = normalizeOptionPhotos(input);
  const wallpad = normalizeWallpad(input);

  await prisma.$transaction(async (tx) => {
    await tx.installationCompletion.upsert({
      where: { installationOrderId: input.orderId },
      create: {
        installationOrderId: input.orderId,
        submittedInstallerId: input.installerId,
        achievedAqaraAppCapability: input.achievedAqaraAppCapability,
        ...wallpad,
        longDistanceAmount: input.longDistanceAmount,
        ...extraClaim,
        ...optionPhotos,
        installEndAt: input.installEndAt,
        photoPaths: input.photoPaths,
        reviewStatus: "PENDING",
      },
      update: {
        submittedInstallerId: input.installerId,
        submittedAt: new Date(),
        achievedAqaraAppCapability: input.achievedAqaraAppCapability,
        ...wallpad,
        longDistanceAmount: input.longDistanceAmount,
        // 재제출은 기타 청구도 통째로 바꾼다. 이번에 비워서 올렸으면 청구를 철회한 것이다.
        ...extraClaim,
        ...optionPhotos,
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
            wallpadLinked: wallpad.wallpadLinked,
            wallpadResult: wallpad.wallpadResult,
            wallpadBilling: wallpad.wallpadBilling,
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
  const caseNeedingSiteName = await prisma.$transaction(async (tx) => {
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

    // 승인된 건만 월패드 호환 현장 사례로 남긴다(반려된 내용이 데이터에 섞이지 않게).
    const wallpadCaseId = await recordCompletionWallpadCase(tx, input.orderId);

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

    return wallpadCaseId;
  });

  // 네이버 건물명 조회는 외부 호출이라 트랜잭션 밖에서 한다. 실패해도 승인은 끝난 것이다.
  if (caseNeedingSiteName) await fillCompletionCaseSiteName(caseNeedingSiteName);
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
  /** HQ 본사 청구 / ONSITE 현장 결제. 비어 있으면 옛 제출 또는 연동 성공 아님 */
  wallpadBilling: string | null;
  wallpadResult: string | null;
  wallpadBrand: string | null;
  wallpadModel: string | null;
  wallpadFailReason: string | null;
  wallpadNote: string | null;
  longDistanceAmount: number | null;
  extraClaimAmount: number | null;
  extraClaimReason: string | null;
  extraClaimPhotos: CompletionPhoto[];
  linkagePhotos: CompletionPhoto[];
  wallpadPhotos: CompletionPhoto[];
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
    wallpadBilling: c.wallpadBilling,
    wallpadResult: c.wallpadResult,
    wallpadBrand: c.wallpadBrand,
    wallpadModel: c.wallpadModel,
    wallpadFailReason: c.wallpadFailReason,
    wallpadNote: c.wallpadNote,
    longDistanceAmount: c.longDistanceAmount,
    extraClaimAmount: c.extraClaimAmount,
    extraClaimReason: c.extraClaimReason,
    extraClaimPhotos: await getCompletionPhotoSignedUrls(c.extraClaimPhotoPaths),
    linkagePhotos: await getCompletionPhotoSignedUrls(c.linkagePhotoPaths),
    wallpadPhotos: await getCompletionPhotoSignedUrls(c.wallpadPhotoPaths),
    installEndAt: c.installEndAt.toISOString(),
    reviewStatus: c.reviewStatus,
    rejectionReason: c.rejectionReason,
    photos: await getCompletionPhotoSignedUrls(c.photoPaths),
  };
}
