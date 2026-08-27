import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isKoreanMobileNumber, isSafeVirtualNumber, normalizePhone } from "@/lib/phone";
import { hmacPii } from "@/lib/piiCrypto";
import { sendSms } from "@/lib/sms";

// 고객용 OTP. installer/otp.ts 와 같은 구조지만 두 가지가 다르다.
//
// 1. 발급 대상을 미리 알 수 없다. 기사 OTP 는 등록된 기사에게만 보내면 되지만
//    이쪽은 공개 페이지라 누구든 요청할 수 있다. 그래서 레이트 리밋이 유일한
//    방어선이고, 기사 쪽보다 조금 더 조인다.
// 2. 인증 성공 후 레코드를 지우지 않고 verifiedToken 을 남긴다. 제출 시 서버가
//    이 토큰으로 "이 번호는 인증을 통과했다" 를 다시 확인한다. 공개 페이지라
//    이 검증이 없으면 프런트를 건너뛴 직접 POST 로 인증을 통째로 우회할 수 있다.

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LENGTH = 6;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;
// 인증 후 제출까지 주어지는 시간. 주소 검색·날짜 선택에 걸리는 시간을 감안해
// OTP 자체보다 넉넉하게 준다.
const VERIFIED_TOKEN_TTL_MS = 30 * 60 * 1000;

export class CustomerOtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerOtpError";
  }
}

function hashCode(code: string) {
  return hmacPii(`customer-otp:${code}`);
}

function generateCode() {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function generateVerifiedToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function sendCustomerOtp(rawPhone: string): Promise<{ ok: true }> {
  const phone = normalizePhone(rawPhone);
  if (!isKoreanMobileNumber(phone)) {
    throw new CustomerOtpError("INVALID_PHONE");
  }
  // 안심번호는 며칠 뒤면 만료된다. 인증을 통과시켜 봐야 정작 기사가 걸 때는
  // 못 쓰는 번호가 되므로 입구에서 막는다.
  if (isSafeVirtualNumber(phone)) {
    throw new CustomerOtpError("PHONE_IS_SAFE_NUMBER");
  }

  const phoneHash = hmacPii(phone);
  const now = new Date();

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentCount = await prisma.customerAuthOtp.count({
    where: { phoneHash, createdAt: { gt: oneHourAgo } },
  });
  if (recentCount >= MAX_SENDS_PER_HOUR) {
    throw new CustomerOtpError("TOO_MANY_REQUESTS");
  }

  const lastOtp = await prisma.customerAuthOtp.findFirst({
    where: { phoneHash },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastOtp && now.getTime() - lastOtp.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new CustomerOtpError("RESEND_TOO_SOON");
  }

  const code = generateCode();
  await prisma.customerAuthOtp.create({
    data: {
      phoneHash,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    },
  });

  await sendSms(phone, `[Aqara 설치] 인증번호 ${code} (5분 이내 입력)`);
  return { ok: true };
}

export async function verifyCustomerOtp(
  rawPhone: string,
  rawCode: string,
): Promise<{ verifiedToken: string }> {
  const phone = normalizePhone(rawPhone);
  const code = (rawCode ?? "").replace(/\D/g, "");
  if (phone.length < 10 || code.length !== OTP_LENGTH) {
    throw new CustomerOtpError("INVALID_INPUT");
  }

  const phoneHash = hmacPii(phone);
  const now = new Date();

  const otp = await prisma.customerAuthOtp.findFirst({
    where: { phoneHash, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    throw new CustomerOtpError("CODE_EXPIRED");
  }

  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
    await prisma.customerAuthOtp.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });
    throw new CustomerOtpError("TOO_MANY_ATTEMPTS");
  }

  if (otp.codeHash !== hashCode(code)) {
    await prisma.customerAuthOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new CustomerOtpError("CODE_MISMATCH");
  }

  // consumedAt 을 채워 이 코드로는 더 인증할 수 없게 하고, 제출 때 쓸
  // verifiedToken 을 남긴다.
  const verifiedToken = generateVerifiedToken();
  await prisma.customerAuthOtp.update({
    where: { id: otp.id },
    data: { consumedAt: now, verifiedAt: now, verifiedToken },
  });

  return { verifiedToken };
}

// 제출 시 호출한다. 토큰이 유효하고, 그 토큰이 인증한 번호가 지금 제출하려는
// 주문자 번호와 같은지까지 확인한다(다른 번호로 인증한 토큰 재사용 방지).
export async function consumeVerifiedCustomerPhone(
  verifiedToken: string,
  rawPhone: string,
  now = new Date(),
): Promise<void> {
  const token = verifiedToken?.trim();
  if (!token) {
    throw new CustomerOtpError("PHONE_NOT_VERIFIED");
  }

  const phone = normalizePhone(rawPhone);
  const otp = await prisma.customerAuthOtp.findUnique({
    where: { verifiedToken: token },
    select: { id: true, phoneHash: true, verifiedAt: true },
  });

  if (!otp?.verifiedAt) {
    throw new CustomerOtpError("PHONE_NOT_VERIFIED");
  }
  if (otp.phoneHash !== hmacPii(phone)) {
    throw new CustomerOtpError("VERIFIED_PHONE_MISMATCH");
  }
  if (now.getTime() - otp.verifiedAt.getTime() > VERIFIED_TOKEN_TTL_MS) {
    throw new CustomerOtpError("VERIFICATION_EXPIRED");
  }

  // 토큰은 한 번만 쓴다. 같은 인증으로 여러 건을 제출할 수 없게 태운다.
  await prisma.customerAuthOtp.update({
    where: { id: otp.id },
    data: { verifiedToken: null },
  });
}

export function getCustomerOtpErrorMessage(code: string) {
  const messages: Record<string, string> = {
    INVALID_PHONE: "올바른 휴대폰 번호를 입력해 주세요.",
    PHONE_IS_SAFE_NUMBER: "안심번호(050)로는 인증할 수 없습니다. 실제 휴대폰 번호를 입력해 주세요.",
    INVALID_INPUT: "인증번호를 다시 확인해 주세요.",
    TOO_MANY_REQUESTS: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    RESEND_TOO_SOON: "잠시 후 다시 요청해 주세요.",
    CODE_EXPIRED: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
    TOO_MANY_ATTEMPTS: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
    CODE_MISMATCH: "인증번호가 일치하지 않습니다.",
    PHONE_NOT_VERIFIED: "주문자 번호 인증을 먼저 완료해 주세요.",
    VERIFIED_PHONE_MISMATCH: "인증한 번호와 입력한 번호가 다릅니다. 다시 인증해 주세요.",
    VERIFICATION_EXPIRED: "인증 후 시간이 오래 지났습니다. 다시 인증해 주세요.",
  };

  return messages[code] ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
