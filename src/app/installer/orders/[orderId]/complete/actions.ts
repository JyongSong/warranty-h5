"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
import { computeInstallLineItems } from "@/lib/installation/settlement/compute";
import { resolveInstallerRates } from "@/lib/installation/settlement/rates";
import {
  COMPLETION_PHOTO_BUCKET,
  createCompletionUploadTargets,
} from "@/lib/installer/storage";
import {
  InstallationCompletionError,
  submitInstallerCompletion,
} from "@/lib/installation/completion/service";

export type SubmitCompletionResult = { ok: true } | { ok: false; error: string };

export type UploadTargetsResult =
  | { ok: true; bucket: string; targets: Array<{ path: string; token: string }> }
  | { ok: false; error: string };

// Step 1: hand the client signed upload targets so it uploads photos DIRECTLY
// to Supabase Storage (no photo bytes through the Server Action / Vercel).
export async function getCompletionUploadTargetsAction(
  orderId: string,
  count: number,
): Promise<UploadTargetsResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  const view = await getInstallerOrderView(installer.id, orderId);
  if (!view || view.status !== "ACCEPTED") return { ok: false, error: "ORDER_NOT_SUBMITTABLE" };
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return { ok: false, error: "PHOTO_COUNT_INVALID" };
  }

  try {
    const targets = await createCompletionUploadTargets(orderId, count);
    return { ok: true, bucket: COMPLETION_PHOTO_BUCKET, targets };
  } catch (error) {
    console.error("[installer/completion/upload-targets]", error);
    return { ok: false, error: "UPLOAD_TARGET_FAILED" };
  }
}

// Step 2: submit the completion with the already-uploaded photo paths (small
// JSON payload — no Vercel body-size concern).
export async function submitCompletionAction(input: {
  orderId: string;
  capability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  installEndAt: string;
  photoPaths: string[];
}): Promise<SubmitCompletionResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  const orderId = input.orderId?.trim() ?? "";
  const view = await getInstallerOrderView(installer.id, orderId);
  if (!view || view.status !== "ACCEPTED") return { ok: false, error: "ORDER_NOT_SUBMITTABLE" };

  const installEndAt = input.installEndAt ? new Date(input.installEndAt) : new Date(NaN);
  if (Number.isNaN(installEndAt.getTime())) return { ok: false, error: "INSTALL_END_REQUIRED" };

  const photoPaths = Array.isArray(input.photoPaths) ? input.photoPaths : [];
  if (photoPaths.length < 1 || photoPaths.length > 4) return { ok: false, error: "PHOTO_COUNT_INVALID" };
  // Paths must belong to this order (they came from our signed targets).
  if (!photoPaths.every((p) => typeof p === "string" && p.startsWith(`orders/${orderId}/`))) {
    return { ok: false, error: "INVALID_PHOTO_PATHS" };
  }

  try {
    await submitInstallerCompletion({
      installerId: installer.id,
      orderId,
      achievedAqaraAppCapability: input.capability ?? "NONE",
      wallpadLinked: Boolean(input.wallpadLinked),
      wallpadAmount: input.wallpadAmount ?? null,
      longDistanceAmount: input.longDistanceAmount ?? null,
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

export type SettlementPreview =
  | {
      ok: true;
      linkageFee: number;
      travelFee: number;
      longDistanceFee: number;
      nightWeekendFee: number;
      wallpadAmount: number;
      totalAmount: number;
      night: boolean;
      weekend: boolean;
    }
  | { ok: false };

/**
 * 제출 전에 보여줄 정산 예상 금액.
 *
 * 실제 스냅샷은 본사 승인 시점에 같은 computeInstallLineItems 로 다시 계산된다.
 * 여기서 미리 보여주는 이유는 기사가 "얼마짜리 건을 올리는지" 모르고 제출하지
 * 않게 하려는 것이고, 그래서 계산식을 복제하지 않고 같은 함수를 부른다.
 *
 * 확인용이므로 실패해도 제출을 막지 않는다 (ok:false → 금액 없이 확인만 받는다).
 */
export async function previewInstallSettlementAction(input: {
  orderId: string;
  capability: string;
  longDistanceAmount: number | null;
  wallpadAmount: number | null;
  installEndAt: string;
}): Promise<SettlementPreview> {
  try {
    const installer = await getCurrentInstaller();
    if (!installer) return { ok: false };

    const view = await getInstallerOrderView(installer.id, input.orderId?.trim() ?? "");
    if (!view || view.status !== "ACCEPTED") return { ok: false };

    const installEndAt = input.installEndAt ? new Date(input.installEndAt) : new Date(NaN);
    if (Number.isNaN(installEndAt.getTime())) return { ok: false };

    const { rates } = await resolveInstallerRates(installer.id);
    const { items, breakdown } = computeInstallLineItems({
      achievedAqaraAppCapability: input.capability,
      longDistanceAmount: input.longDistanceAmount,
      wallpadAmount: input.wallpadAmount,
      installEndAt,
      rates,
    });

    return {
      ok: true,
      linkageFee: items.linkageFee,
      travelFee: items.travelFee,
      longDistanceFee: items.longDistanceFee,
      nightWeekendFee: items.nightWeekendFee,
      wallpadAmount: items.wallpadAmount,
      totalAmount: items.totalAmount,
      night: breakdown.night,
      weekend: breakdown.weekend,
    };
  } catch (error) {
    console.error("[installer/completion/preview]", error);
    return { ok: false };
  }
}
