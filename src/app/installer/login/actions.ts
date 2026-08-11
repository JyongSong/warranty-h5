"use server";

import { InstallerOtpError, sendInstallerOtp, verifyInstallerOtp } from "@/lib/installer/otp";
import { setInstallerSessionCookie } from "@/lib/installer/session";

export type InstallerAuthResult = { ok: true } | { ok: false; error: string };

export async function requestInstallerOtpAction(phone: string): Promise<InstallerAuthResult> {
  try {
    await sendInstallerOtp(phone);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerOtpError) return { ok: false, error: error.message };
    console.error("[installer/otp/send]", error);
    return { ok: false, error: "OTP_SEND_FAILED" };
  }
}

export async function verifyInstallerOtpAction(phone: string, code: string): Promise<InstallerAuthResult> {
  try {
    const { installerId } = await verifyInstallerOtp(phone, code);
    await setInstallerSessionCookie(installerId);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerOtpError) return { ok: false, error: error.message };
    console.error("[installer/otp/verify]", error);
    return { ok: false, error: "OTP_VERIFY_FAILED" };
  }
}
