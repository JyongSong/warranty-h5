"use server";

import { sendCustomerOtp, verifyCustomerOtp } from "@/lib/installation/cj/otp";
import {
  getBackofficeSignupErrorCode,
  getBackofficeSignupErrorMessage,
  signUpBackofficeUser,
  type BackofficeSignupInput,
} from "@/lib/backoffice/signup";

export type SignupActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string };

function fail(error: unknown): { ok: false; error: string; message: string } {
  const code = getBackofficeSignupErrorCode(error);
  return { ok: false, error: code, message: getBackofficeSignupErrorMessage(code) };
}

export async function requestSignupOtpAction(phone: string): Promise<SignupActionResult> {
  try {
    await sendCustomerOtp(phone, "[Aqara 백오피스 가입]");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function verifySignupOtpAction(
  phone: string,
  code: string,
): Promise<SignupActionResult<{ verifiedToken: string }>> {
  try {
    const { verifiedToken } = await verifyCustomerOtp(phone, code);
    return { ok: true, verifiedToken };
  } catch (error) {
    return fail(error);
  }
}

export async function signUpBackofficeAction(
  input: BackofficeSignupInput,
): Promise<SignupActionResult> {
  try {
    await signUpBackofficeUser(input);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
