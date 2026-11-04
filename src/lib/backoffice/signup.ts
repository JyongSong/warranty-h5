import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { encryptPii, hmacPii, normalizeEmailForHash } from "@/lib/piiCrypto";
import {
  createBackofficeAuthUser,
  deleteBackofficeAuthUser,
} from "@/lib/login/backofficeAuthAdmin";
import {
  CustomerOtpError,
  consumeVerifiedCustomerPhone,
} from "@/lib/installation/cj/otp";
import { BACKOFFICE_LEVEL } from "@/lib/login/backofficeRoles";

// 백오피스 회원가입. 가입 즉시 로그인 계정은 만들어지지만 등급이 0(승인 대기)이라
// 최고 관리자가 승인하며 등급·이름을 정해 줄 때까지 백오피스에 들어올 수 없다.

export const BACKOFFICE_SIGNUP_MIN_PASSWORD_LENGTH = 8;

export class BackofficeSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackofficeSignupError";
  }
}

export type BackofficeSignupInput = {
  email: string;
  phone: string;
  verifiedToken: string;
  password: string;
  confirmPassword: string;
};

export function parseBackofficeSignupInput(input: BackofficeSignupInput) {
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(input.phone ?? "");
  const password = input.password ?? "";

  if (!email) throw new BackofficeSignupError("EMAIL_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BackofficeSignupError("EMAIL_INVALID");
  if (!phone) throw new BackofficeSignupError("PHONE_REQUIRED");
  if (!input.verifiedToken?.trim()) throw new BackofficeSignupError("PHONE_NOT_VERIFIED");
  if (password.length < BACKOFFICE_SIGNUP_MIN_PASSWORD_LENGTH) {
    throw new BackofficeSignupError("PASSWORD_TOO_SHORT");
  }
  if (password !== (input.confirmPassword ?? "")) {
    throw new BackofficeSignupError("PASSWORD_CONFIRMATION_MISMATCH");
  }

  return { email, phone, password, verifiedToken: input.verifiedToken.trim() };
}

export async function signUpBackofficeUser(input: BackofficeSignupInput): Promise<{ id: string }> {
  const parsed = parseBackofficeSignupInput(input);
  const emailHash = hmacPii(normalizeEmailForHash(parsed.email));

  const existing = await prisma.backofficeUser.findUnique({
    where: { emailHash },
    select: { id: true },
  });
  if (existing) throw new BackofficeSignupError("EMAIL_ALREADY_REGISTERED");

  let supabaseUserId: string;
  try {
    ({ supabaseUserId } = await createBackofficeAuthUser(parsed.email, parsed.password));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "email_exists" || code === "user_already_exists") {
      throw new BackofficeSignupError("EMAIL_ALREADY_REGISTERED");
    }
    if (code === "weak_password") throw new BackofficeSignupError("PASSWORD_TOO_WEAK");
    console.error("[backoffice/signup/create-auth]", error);
    throw new BackofficeSignupError("SIGNUP_FAILED");
  }

  // 인증 토큰은 로그인 계정이 만들어진 뒤에 태운다. 그래야 비밀번호 같은 문제로
  // 실패했을 때 다시 문자 인증을 받지 않아도 된다.
  try {
    await consumeVerifiedCustomerPhone(parsed.verifiedToken, parsed.phone);
  } catch (error) {
    await deleteBackofficeAuthUser(supabaseUserId).catch((rollbackError) => {
      console.error("[backoffice/signup/otp-rollback]", rollbackError);
    });
    throw error;
  }

  try {
    const user = await prisma.backofficeUser.create({
      data: {
        supabaseUserId,
        emailEncrypted: encryptPii(parsed.email),
        emailHash,
        phoneEncrypted: encryptPii(parsed.phone),
        level: BACKOFFICE_LEVEL.PENDING,
      },
      select: { id: true },
    });
    return user;
  } catch (error) {
    console.error("[backoffice/signup/create]", error);
    await deleteBackofficeAuthUser(supabaseUserId).catch((rollbackError) => {
      console.error("[backoffice/signup/create-rollback]", rollbackError);
    });
    throw new BackofficeSignupError("SIGNUP_FAILED");
  }
}

export function getBackofficeSignupErrorCode(error: unknown) {
  if (error instanceof BackofficeSignupError || error instanceof CustomerOtpError) {
    return error.message;
  }
  console.error("[backoffice/signup]", error);
  return "SIGNUP_FAILED";
}

export function getBackofficeSignupErrorMessage(code: string) {
  const messages: Record<string, string> = {
    EMAIL_REQUIRED: "이메일을 입력해 주세요.",
    EMAIL_INVALID: "올바른 이메일을 입력해 주세요.",
    EMAIL_ALREADY_REGISTERED: "이미 가입된 이메일입니다. 로그인하거나 관리자에게 문의해 주세요.",
    PHONE_REQUIRED: "휴대폰 번호를 입력해 주세요.",
    PASSWORD_TOO_SHORT: `비밀번호는 ${BACKOFFICE_SIGNUP_MIN_PASSWORD_LENGTH}자 이상으로 입력해 주세요.`,
    PASSWORD_TOO_WEAK: "비밀번호가 너무 단순합니다. 다른 비밀번호를 입력해 주세요.",
    PASSWORD_CONFIRMATION_MISMATCH: "비밀번호가 서로 일치하지 않습니다.",
    INVALID_PHONE: "올바른 휴대폰 번호를 입력해 주세요.",
    PHONE_IS_SAFE_NUMBER: "안심번호(050)로는 인증할 수 없습니다. 실제 휴대폰 번호를 입력해 주세요.",
    INVALID_INPUT: "인증번호를 다시 확인해 주세요.",
    TOO_MANY_REQUESTS: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    RESEND_TOO_SOON: "잠시 후 다시 요청해 주세요.",
    CODE_EXPIRED: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
    TOO_MANY_ATTEMPTS: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
    CODE_MISMATCH: "인증번호가 일치하지 않습니다.",
    PHONE_NOT_VERIFIED: "휴대폰 인증을 먼저 완료해 주세요.",
    VERIFIED_PHONE_MISMATCH: "인증한 번호와 입력한 번호가 다릅니다. 다시 인증해 주세요.",
    VERIFICATION_EXPIRED: "인증 후 시간이 오래 지났습니다. 다시 인증해 주세요.",
  };
  return messages[code] ?? "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}
