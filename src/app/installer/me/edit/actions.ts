"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import {
  InstallerProfileError,
  parseInstallerProfileInput,
  saveInstallerProfile,
} from "@/lib/installer/profile";

export type SaveProfileResult = { ok: true } | { ok: false; error: string };

/**
 * 기사가 본인 정보를 저장한다.
 *
 * 대상은 항상 세션의 기사다. 화면에서 기사 id 를 받지 않으므로, 링크를 고쳐도
 * 남의 정보를 건드릴 수 없다.
 */
export async function saveInstallerProfileAction(input: {
  name: string;
  branch: string;
  address: string;
  aqaraAppCapability: string;
  asEmergencyAvailability: string;
}): Promise<SaveProfileResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  try {
    await saveInstallerProfile(installer.id, parseInstallerProfileInput(input));
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerProfileError) return { ok: false, error: error.message };
    console.error("[installer/profile/save]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}
