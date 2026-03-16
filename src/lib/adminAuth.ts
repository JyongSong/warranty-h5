import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const MANAGEMENT_COOKIE_NAME = "management_session";

type SessionPayload = {
  adminId: string;
};

export type AuthAdmin = {
  id: string;
  name: string;
  level: number;
};

function getSessionSecret() {
  const secret = process.env.MANAGEMENT_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("MANAGEMENT_SESSION_SECRET_MISSING");
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

export function createManagementSessionToken(payload: SessionPayload) {
  const data = toBase64Url(JSON.stringify(payload));
  const signature = sign(data);
  return `${data}.${signature}`;
}

function parseManagementSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;

  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = sign(data);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length) return null;
  if (!crypto.timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(data)) as SessionPayload;
    if (!parsed?.adminId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getCurrentAdmin(): Promise<AuthAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(MANAGEMENT_COOKIE_NAME)?.value;
  const session = parseManagementSessionToken(token);

  if (!session) {
    return null;
  }

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: {
      id: true,
      name: true,
      level: true,
    },
  });

  return admin ?? null;
}

export async function requireAdminPage(nextPath: string, minLevel = 0): Promise<AuthAdmin> {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect(`/auth?next=${encodeURIComponent(nextPath)}`);
  }

  if (admin.level < minLevel) {
    redirect(`/auth?next=${encodeURIComponent(nextPath)}&error=forbidden`);
  }

  return admin;
}

export async function requireAdminApi(minLevel = 0) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return {
        admin: null,
        errorResponse: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
      };
    }

    if (admin.level < minLevel) {
      return {
        admin: null,
        errorResponse: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
      };
    }

    return {
      admin,
      errorResponse: null,
    };
  } catch (error) {
    return {
      admin: null,
      errorResponse: NextResponse.json(
        {
          error: error instanceof Error ? error.message : "AUTH_ERROR",
        },
        { status: 500 }
      ),
    };
  }
}
