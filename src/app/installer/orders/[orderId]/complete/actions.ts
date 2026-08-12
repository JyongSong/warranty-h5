"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
import { uploadCompletionPhoto } from "@/lib/installer/storage";
import {
  InstallationCompletionError,
  submitInstallerCompletion,
} from "@/lib/installation/completion/service";

export type SubmitCompletionResult = { ok: true } | { ok: false; error: string };

export async function submitCompletionAction(formData: FormData): Promise<SubmitCompletionResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  const orderId = String(formData.get("orderId") ?? "");
  const achievedAqaraAppCapability = String(formData.get("capability") ?? "NONE");
  const wallpadLinked = formData.get("wallpadLinked") === "true";
  const wallpadAmountRaw = String(formData.get("wallpadAmount") ?? "").replace(/[^\d]/g, "");
  const wallpadAmount = wallpadAmountRaw ? Number(wallpadAmountRaw) : null;
  const installEndAtRaw = String(formData.get("installEndAt") ?? "");

  // Authorize: must be this installer's active (accepted) job.
  const view = await getInstallerOrderView(installer.id, orderId);
  if (!view || view.status !== "ACCEPTED") return { ok: false, error: "ORDER_NOT_SUBMITTABLE" };

  const installEndAt = installEndAtRaw ? new Date(installEndAtRaw) : new Date(NaN);
  if (Number.isNaN(installEndAt.getTime())) return { ok: false, error: "INSTALL_END_REQUIRED" };

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length < 1 || files.length > 4) return { ok: false, error: "PHOTO_COUNT_INVALID" };

  try {
    const photoPaths: string[] = [];
    for (const file of files) {
      photoPaths.push(await uploadCompletionPhoto(orderId, file));
    }

    await submitInstallerCompletion({
      installerId: installer.id,
      orderId,
      achievedAqaraAppCapability,
      wallpadLinked,
      wallpadAmount,
      installEndAt,
      photoPaths,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallationCompletionError) return { ok: false, error: error.message };
    console.error("[installer/completion/submit]", error);
    return { ok: false, error: "SUBMIT_FAILED" };
  }
}
