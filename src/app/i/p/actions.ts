"use server";

import { InstallerOtpError, sendInstallerOtp, verifyInstallerOtp } from "@/lib/installer/otp";
import {
  InstallerProfileError,
  parseInstallerProfileInput,
  saveInstallerProfile,
} from "@/lib/installer/profile";
import {
  getProfileSessionInstallerId,
  setProfileSessionCookie,
} from "@/lib/installer/profile-session";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** 1단계: 등록된 기사 번호면 인증번호를 보낸다. */
export async function requestProfileOtpAction(phone: string): Promise<ActionResult> {
  try {
    await sendInstallerOtp(phone);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerOtpError) return { ok: false, error: error.message };
    console.error("[i/p/otp-request]", error);
    return { ok: false, error: "SEND_FAILED" };
  }
}

/**
 * 2단계: 인증번호를 확인하고 이 화면 전용 쿠키를 심는다.
 * 기사 앱 세션은 만들지 않는다 — 이 링크로는 정보 화면까지만 들어온다.
 */
export async function verifyProfileOtpAction(phone: string, code: string): Promise<ActionResult> {
  try {
    const { installerId } = await verifyInstallerOtp(phone, code);
    await setProfileSessionCookie(installerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerOtpError) return { ok: false, error: error.message };
    console.error("[i/p/otp-verify]", error);
    return { ok: false, error: "VERIFY_FAILED" };
  }
}

/** 3단계: 저장. 대상은 쿠키가 가리키는 기사 본인뿐이다. */
export async function saveProfileAction(input: {
  name: string;
  branch: string;
  address: string;
  aqaraAppCapability: string;
  asEmergencyAvailability: string;
}): Promise<ActionResult> {
  const installerId = await getProfileSessionInstallerId();
  if (!installerId) return { ok: false, error: "SESSION_EXPIRED" };

  try {
    await saveInstallerProfile(installerId, parseInstallerProfileInput(input));
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerProfileError) return { ok: false, error: error.message };
    console.error("[i/p/save]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}
