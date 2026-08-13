"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import { getInstallerAsOrderView } from "@/lib/installer/asOrders";
import { COMPLETION_PHOTO_BUCKET, createAsCompletionUploadTargets } from "@/lib/installer/storage";
import { AsOrderError, submitAsCompletion } from "@/lib/installation/as/service";

export type AsUploadTargetsResult =
  | { ok: true; bucket: string; targets: Array<{ path: string; token: string }> }
  | { ok: false; error: string };

export async function getAsUploadTargetsAction(
  asOrderId: string,
  count: number,
): Promise<AsUploadTargetsResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  const view = await getInstallerAsOrderView(installer.id, asOrderId);
  if (!view || view.status !== "ACCEPTED") return { ok: false, error: "AS_ORDER_NOT_SUBMITTABLE" };
  if (!Number.isInteger(count) || count < 0 || count > 4) return { ok: false, error: "PHOTO_COUNT_INVALID" };
  if (count === 0) return { ok: true, bucket: COMPLETION_PHOTO_BUCKET, targets: [] };

  try {
    const targets = await createAsCompletionUploadTargets(asOrderId, count);
    return { ok: true, bucket: COMPLETION_PHOTO_BUCKET, targets };
  } catch (error) {
    console.error("[installer/as/upload-targets]", error);
    return { ok: false, error: "UPLOAD_TARGET_FAILED" };
  }
}

export type SubmitAsCompletionResult = { ok: true } | { ok: false; error: string };

export async function submitAsCompletionAction(input: {
  asOrderId: string;
  resolutionDetail: string;
  serviceFee: number | null;
  photoPaths: string[];
}): Promise<SubmitAsCompletionResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  const view = await getInstallerAsOrderView(installer.id, input.asOrderId);
  if (!view || view.status !== "ACCEPTED") return { ok: false, error: "AS_ORDER_NOT_SUBMITTABLE" };

  const photoPaths = Array.isArray(input.photoPaths) ? input.photoPaths : [];
  if (photoPaths.length > 4) return { ok: false, error: "PHOTO_COUNT_INVALID" };
  if (!photoPaths.every((p) => typeof p === "string" && p.startsWith(`as/${input.asOrderId}/`))) {
    return { ok: false, error: "INVALID_PHOTO_PATHS" };
  }

  try {
    await submitAsCompletion({
      installerId: installer.id,
      asOrderId: input.asOrderId,
      resolutionDetail: input.resolutionDetail ?? "",
      serviceFee: input.serviceFee ?? null,
      photoPaths,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AsOrderError) return { ok: false, error: error.message };
    console.error("[installer/as/submit]", error);
    return { ok: false, error: "SUBMIT_FAILED" };
  }
}
