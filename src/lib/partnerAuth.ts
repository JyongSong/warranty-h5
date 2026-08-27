import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// CJ 담당자용 세션. 백오피스(adminAuth)와 쿠키·비밀키·테이블을 전부 분리한다.
// 같은 계정 체계에 얹으면 백오피스 페이지 한 곳만 레벨 검사를 빠뜨려도 고객
// 개인정보가 새기 때문에, 이 계정으로는 /partner 아래 업로드 화면 말고는
// 아무것도 열 수 없게 둔다.

export const PARTNER_COOKIE_NAME = "partner_session";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type PartnerSessionPayload = {
  partnerId: string;
  issuedAt: number;
};

export type AuthPartner = {
  id: string;
  name: string;
  partnerCode: string;
};

function getSessionSecret() {
  // 백오피스와 다른 비밀키를 쓴다. 한쪽 토큰이 새도 다른 쪽으로 넘어갈 수 없다.
  const secret =
    process.env.PARTNER_SESSION_SECRET?.trim() ||
    process.env.MANAGEMENT_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("PARTNER_SESSION_SECRET_MISSING");
  }

  // 폴백으로 백오피스 키를 쓰게 되더라도 파생을 거쳐 서명이 겹치지 않게 한다.
  return crypto.createHmac("sha256", secret).update("partner-session-v1").digest("hex");
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

export function createPartnerSessionToken(payload: PartnerSessionPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function parsePartnerSessionToken(token: string | undefined | null): PartnerSessionPayload | null {
  if (!token) return null;

  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = sign(data);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return null;
  if (!crypto.timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as PartnerSessionPayload;
    if (!parsed?.partnerId || typeof parsed.issuedAt !== "number") return null;
    if (Date.now() - parsed.issuedAt > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashPartnerPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

// 저장 형식: scrypt$<salt>$<hash>
export function buildPartnerPasswordHash(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${hashPartnerPassword(password, salt)}`;
}

export function verifyPartnerPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const candidate = Buffer.from(hashPartnerPassword(password, salt));
  const expected = Buffer.from(hash);
  if (candidate.length !== expected.length) return false;

  return crypto.timingSafeEqual(candidate, expected);
}

export async function getAuthPartner(): Promise<AuthPartner | null> {
  const store = await cookies();
  const session = parsePartnerSessionToken(store.get(PARTNER_COOKIE_NAME)?.value);
  if (!session) return null;

  const partner = await prisma.partnerAccount.findUnique({
    where: { id: session.partnerId },
    select: { id: true, name: true, partnerCode: true, active: true },
  });

  if (!partner?.active) return null;

  return { id: partner.id, name: partner.name, partnerCode: partner.partnerCode };
}

export async function requirePartner(): Promise<AuthPartner> {
  const partner = await getAuthPartner();
  if (!partner) {
    redirect("/partner/login");
  }
  return partner;
}
