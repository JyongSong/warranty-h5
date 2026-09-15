import crypto from "crypto";
import { cookies } from "next/headers";

/**
 * 기사 정보 확인 화면(/i/p) 전용 인증.
 *
 * 기사 앱 세션(installer_session)을 쓰지 않는 이유는 둘이다.
 *  - 문자를 받는 100명 대부분은 앱 사용자가 아니다. 정보 한 번 채우자고 앱
 *    전체(설치 목록·A/S·정산)에 들어갈 수 있는 세션을 줄 이유가 없다.
 *  - 앱 세션은 30일짜리다. 정보 입력은 한 번에 끝나므로 짧게 끊는 편이 낫다.
 *
 * 서명에 용도(scope)를 섞는 것이 핵심이다. 앱 세션 토큰은 payload 를 그대로
 * 서명하는데, 용도를 섞지 않으면 이 토큰을 installer_session 쿠키에 넣었을 때
 * 그대로 통과해 앱 세션이 되어 버린다. 서명 대상 앞에 고정 문자열을 붙여
 * 두 토큰이 서로의 자리에서 절대 유효하지 않게 만든다.
 */

export const PROFILE_COOKIE_NAME = "installer_profile_session";

// 정보를 채워 제출하는 데 걸리는 시간만 열어 둔다.
const MAX_AGE_SECONDS = 60 * 30;

const SIGNING_SCOPE = "installer-profile-v1";

type ProfilePayload = { installerId: string; exp: number };

function getSecret() {
  const secret =
    process.env.INSTALLER_SESSION_SECRET?.trim() || process.env.MANAGEMENT_SESSION_SECRET?.trim();
  if (!secret) throw new Error("INSTALLER_SESSION_SECRET_MISSING");
  return secret;
}

function sign(data: string) {
  // 용도를 서명에 포함한다 — 앱 세션 토큰과 교환되지 않게 하는 장치다.
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${SIGNING_SCOPE}.${data}`)
    .digest("base64url");
}

export function createProfileSessionToken(installerId: string, now = Date.now()) {
  const payload: ProfilePayload = {
    installerId,
    exp: Math.floor(now / 1000) + MAX_AGE_SECONDS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function parseProfileSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): string | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const left = Buffer.from(signature);
  const right = Buffer.from(sign(data));
  if (left.length !== right.length) return null;
  if (!crypto.timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as ProfilePayload;
    if (!parsed?.installerId || typeof parsed.exp !== "number") return null;
    if (parsed.exp * 1000 <= now) return null;
    return parsed.installerId;
  } catch {
    return null;
  }
}

export async function setProfileSessionCookie(installerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PROFILE_COOKIE_NAME, createProfileSessionToken(installerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearProfileSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PROFILE_COOKIE_NAME);
}

/** 현재 요청이 어떤 기사의 정보를 고칠 수 있는지. 없으면 null. */
export async function getProfileSessionInstallerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseProfileSessionToken(cookieStore.get(PROFILE_COOKIE_NAME)?.value);
}
