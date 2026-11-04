import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const MANAGEMENT_COOKIE_NAME = "management_session";

type SessionPayload = {
  adminId: string;
};

export type AuthAdmin = {
  id: string;
  name: string;
  // 백오피스(Supabase) 로그인일 때만 채워진다. 예전 관리 쿠키 로그인(getCurrentAdmin)에는 없다.
  email?: string;
  displayName?: string | null;
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

import { getCurrentBackofficeUser, requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  BACKOFFICE_READ_ONLY_ERROR,
  hasBackofficeAccess,
  type BackofficeAccess,
} from "@/lib/login/backofficeRoles";

export const requirePortalUserPage = requireBackofficeUserPage;

export async function requireAdminPage(
  nextPath: string,
  access: BackofficeAccess = "view",
): Promise<AuthAdmin> {
  const user = await requireBackofficeUserPage(nextPath, access);
  return {
    id: user.id,
    name: user.name || user.email.split("@")[0] || "Admin",
    email: user.email,
    displayName: user.name ?? null,
    level: user.level,
  };
}

// access 기본값은 "edit". 조회(GET·엑셀)만 하는 라우트는 "view" 를 넘긴다.
export async function requireAdminApi(access: BackofficeAccess = "edit") {
  try {
    const user = await getCurrentBackofficeUser();

    if (!user) {
      return {
        admin: null,
        errorResponse: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
      };
    }

    if (!hasBackofficeAccess(user.level, access)) {
      const readOnly = access === "edit" && hasBackofficeAccess(user.level, "view");
      return {
        admin: null,
        errorResponse: NextResponse.json(
          { error: readOnly ? BACKOFFICE_READ_ONLY_ERROR : "FORBIDDEN" },
          { status: 403 },
        ),
      };
    }

    const admin: AuthAdmin = {
      id: user.id,
      name: user.name || user.email.split("@")[0] || "Admin",
      email: user.email,
      displayName: user.name ?? null,
      level: user.level,
    };
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
