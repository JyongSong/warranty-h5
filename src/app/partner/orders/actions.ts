"use server";

import { revalidatePath } from "next/cache";
import { getAuthPartner } from "@/lib/partnerAuth";
import { COMPLETION_PHOTO_BUCKET, createPartnerCompletionUploadTargets } from "@/lib/installer/storage";
import {
  addPartnerNote,
  getInstallationPartnerByCode,
  InstallationPartnerError,
  PARTNER_COMPLETION_PHOTO_MAX,
  submitPartnerCompletion,
  updatePartnerStatus,
} from "@/lib/installation/partner/service";
import { getPartnerOrderDetail } from "@/lib/installation/partner/views";

export type PartnerActionResult = { ok: true } | { ok: false; error: string };
export type PartnerUploadTargetsResult =
  | { ok: true; bucket: string; targets: Array<{ path: string; token: string }> }
  | { ok: false; error: string };

// 협력사 세션(partner_accounts) → 그 계정 코드의 설치 협력사. 다른 코드(CJ) 계정은 막는다.
async function requirePartnerUser() {
  const account = await getAuthPartner();
  if (!account) return null;
  const partner = await getInstallationPartnerByCode(account.partnerCode);
  if (!partner) return null;
  return { id: account.id, partnerId: partner.id };
}

export async function updatePartnerStatusAction(input: {
  orderId: string;
  status: string;
  body?: string | null;
}): Promise<PartnerActionResult> {
  const user = await requirePartnerUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED" };

  return run(input.orderId, () =>
    updatePartnerStatus(input.orderId, {
      partnerId: user.partnerId,
      userId: user.id,
      status: input.status,
      body: input.body,
    }),
  );
}

export async function addPartnerNoteAction(input: { orderId: string; body: string }): Promise<PartnerActionResult> {
  const user = await requirePartnerUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED" };

  return run(input.orderId, () =>
    addPartnerNote(input.orderId, {
      authorType: "PARTNER",
      partnerId: user.partnerId,
      userId: user.id,
      body: input.body,
    }),
  );
}

// 사진은 브라우저가 Storage 로 직접 올린다(서버 액션 본문 크기 제한 회피).
export async function getPartnerUploadTargetsAction(
  orderId: string,
  count: number,
): Promise<PartnerUploadTargetsResult> {
  const user = await requirePartnerUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED" };
  if (!Number.isInteger(count) || count < 1 || count > PARTNER_COMPLETION_PHOTO_MAX) {
    return { ok: false, error: "PHOTO_COUNT_INVALID" };
  }

  const order = await getPartnerOrderDetail(orderId, { partnerId: user.partnerId });
  if (!order || order.status !== "INSTALLER_ASSIGNED") return { ok: false, error: "ORDER_NOT_WORKABLE" };

  try {
    const targets = await createPartnerCompletionUploadTargets(orderId, count);
    return { ok: true, bucket: COMPLETION_PHOTO_BUCKET, targets };
  } catch (error) {
    console.error("[partner/upload-targets]", error);
    return { ok: false, error: "UPLOAD_TARGET_FAILED" };
  }
}

export async function submitPartnerCompletionAction(input: {
  orderId: string;
  body?: string | null;
  photoPaths: string[];
}): Promise<PartnerActionResult> {
  const user = await requirePartnerUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED" };

  return run(input.orderId, () =>
    submitPartnerCompletion(input.orderId, {
      partnerId: user.partnerId,
      userId: user.id,
      body: input.body,
      photoPaths: input.photoPaths,
    }),
  );
}

async function run(orderId: string, operation: () => Promise<unknown>): Promise<PartnerActionResult> {
  try {
    await operation();
    revalidatePath("/partner/orders");
    revalidatePath(`/partner/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallationPartnerError) return { ok: false, error: error.message };
    console.error("[partner/actions]", error);
    return { ok: false, error: "PARTNER_ACTION_FAILED" };
  }
}
