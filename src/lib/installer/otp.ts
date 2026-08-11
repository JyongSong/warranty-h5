import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { hmacPii } from "@/lib/piiCrypto";
import { sendSms } from "@/lib/sms";

// DB-backed, rate-limited installer OTP. Replaces the in-memory api/auth/sms
// (which is non-persistent, unthrottled, and logs the code). Stores only a
// hash of the phone and of the code.

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LENGTH = 6;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;

export class InstallerOtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallerOtpError";
  }
}

function hashCode(code: string) {
  return hmacPii(`installer-otp:${code}`);
}

function generateCode() {
  // 6 digits, zero-padded, from a CSPRNG.
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

async function findActiveInstallerByPhone(normalizedPhone: string) {
  const installer = await prisma.installer.findUnique({
    where: { phone: normalizedPhone },
    select: { id: true, active: true },
  });
  if (!installer || !installer.active) return null;
  return installer;
}

export async function sendInstallerOtp(rawPhone: string): Promise<{ ok: true }> {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    throw new InstallerOtpError("INVALID_PHONE");
  }

  // Only known, active installers may request a code.
  const installer = await findActiveInstallerByPhone(phone);
  if (!installer) {
    throw new InstallerOtpError("INSTALLER_NOT_FOUND");
  }

  const phoneHash = hmacPii(phone);
  const now = new Date();

  // Rate limits: hourly cap + resend cooldown.
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentCount = await prisma.installerAuthOtp.count({
    where: { phoneHash, createdAt: { gt: oneHourAgo } },
  });
  if (recentCount >= MAX_SENDS_PER_HOUR) {
    throw new InstallerOtpError("TOO_MANY_REQUESTS");
  }

  const lastOtp = await prisma.installerAuthOtp.findFirst({
    where: { phoneHash },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastOtp && now.getTime() - lastOtp.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new InstallerOtpError("RESEND_TOO_SOON");
  }

  const code = generateCode();
  await prisma.installerAuthOtp.create({
    data: {
      phoneHash,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    },
  });

  await sendSms(phone, `[Aqara 기사] 인증번호 ${code} (5분 이내 입력)`);
  return { ok: true };
}

export async function verifyInstallerOtp(
  rawPhone: string,
  rawCode: string,
): Promise<{ installerId: string }> {
  const phone = normalizePhone(rawPhone);
  const code = (rawCode ?? "").replace(/\D/g, "");
  if (phone.length < 10 || code.length !== OTP_LENGTH) {
    throw new InstallerOtpError("INVALID_INPUT");
  }

  const installer = await findActiveInstallerByPhone(phone);
  if (!installer) {
    throw new InstallerOtpError("INSTALLER_NOT_FOUND");
  }

  const phoneHash = hmacPii(phone);
  const now = new Date();

  const otp = await prisma.installerAuthOtp.findFirst({
    where: { phoneHash, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    throw new InstallerOtpError("CODE_EXPIRED");
  }

  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
    // Burn it so it can't be brute-forced further.
    await prisma.installerAuthOtp.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });
    throw new InstallerOtpError("TOO_MANY_ATTEMPTS");
  }

  if (otp.codeHash !== hashCode(code)) {
    await prisma.installerAuthOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new InstallerOtpError("CODE_MISMATCH");
  }

  await prisma.installerAuthOtp.update({
    where: { id: otp.id },
    data: { consumedAt: now },
  });

  return { installerId: installer.id };
}
