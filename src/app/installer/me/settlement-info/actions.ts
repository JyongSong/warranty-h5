"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import { COMPLETION_PHOTO_BUCKET, createInstallerDocUploadTargets } from "@/lib/installer/storage";
import {
  SettlementInfoError,
  submitSettlementInfo,
  type SettlementInfoInput,
} from "@/lib/installer/settlement-info";

export type DocUploadTargetsResult =
  | { ok: true; bucket: string; targets: Array<{ path: string; token: string }> }
  | { ok: false; error: string };

/** 사업자등록증·통장 사진 업로드 자리. 경로는 항상 세션 기사의 installer-docs/<id>/ 아래다. */
export async function getDocUploadTargetsAction(count: number): Promise<DocUploadTargetsResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  if (!Number.isInteger(count) || count < 1 || count > 2) return { ok: false, error: "PHOTO_COUNT_INVALID" };
  try {
    const targets = await createInstallerDocUploadTargets(installer.id, count);
    return { ok: true, bucket: COMPLETION_PHOTO_BUCKET, targets };
  } catch (error) {
    console.error("[installer/settlement-info/upload-targets]", error);
    return { ok: false, error: "UPLOAD_TARGET_FAILED" };
  }
}

export type SubmitSettlementInfoResult = { ok: true } | { ok: false; error: string };

/** 대상은 항상 세션의 기사다. 화면에서 기사 id 를 받지 않는다. */
export async function submitSettlementInfoAction(input: SettlementInfoInput): Promise<SubmitSettlementInfoResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  try {
    await submitSettlementInfo(installer.id, input);
    return { ok: true };
  } catch (error) {
    if (error instanceof SettlementInfoError) return { ok: false, error: error.message };
    console.error("[installer/settlement-info/submit]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}
