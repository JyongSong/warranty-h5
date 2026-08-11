import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Self-contained HMAC-signed session cookie for installers (mirrors the
// management_session pattern in adminAuth.ts). Stateless — no session table —
// which suits the Capacitor-shell-over-remote-URL architecture. Falls back to
// MANAGEMENT_SESSION_SECRET so no new env is strictly required.

export const INSTALLER_COOKIE_NAME = "installer_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type SessionPayload = { installerId: string };

export type AuthInstaller = {
  id: string;
  name: string;
};

function getSessionSecret() {
  const secret =
    process.env.INSTALLER_SESSION_SECRET?.trim() || process.env.MANAGEMENT_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("INSTALLER_SESSION_SECRET_MISSING");
  }
  return secret;
}

function toBase64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

export function createInstallerSessionToken(payload: SessionPayload) {
  const data = toBase64Url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

function parseInstallerSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const left = Buffer.from(signature);
  const right = Buffer.from(sign(data));
  if (left.length !== right.length) return null;
  if (!crypto.timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(data)) as SessionPayload;
    if (!parsed?.installerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setInstallerSessionCookie(installerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(INSTALLER_COOKIE_NAME, createInstallerSessionToken({ installerId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearInstallerSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(INSTALLER_COOKIE_NAME);
}

export async function getCurrentInstaller(): Promise<AuthInstaller | null> {
  const cookieStore = await cookies();
  const session = parseInstallerSessionToken(cookieStore.get(INSTALLER_COOKIE_NAME)?.value);
  if (!session) return null;

  const installer = await prisma.installer.findUnique({
    where: { id: session.installerId },
    select: { id: true, name: true, active: true },
  });
  if (!installer || !installer.active) return null;

  return { id: installer.id, name: installer.name };
}

export async function requireInstallerPage(nextPath: string): Promise<AuthInstaller> {
  const installer = await getCurrentInstaller();
  if (!installer) {
    redirect(`/installer/login?redirect_url=${encodeURIComponent(nextPath)}`);
  }
  return installer;
}

export async function requireInstallerApi(): Promise<
  { installer: AuthInstaller; errorResponse: null } | { installer: null; errorResponse: NextResponse }
> {
  try {
    const installer = await getCurrentInstaller();
    if (!installer) {
      return { installer: null, errorResponse: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
    }
    return { installer, errorResponse: null };
  } catch (error) {
    return {
      installer: null,
      errorResponse: NextResponse.json(
        { error: error instanceof Error ? error.message : "AUTH_ERROR" },
        { status: 500 },
      ),
    };
  }
}
