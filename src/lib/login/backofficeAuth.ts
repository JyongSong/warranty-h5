import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  decryptPii,
  encryptPii,
  hmacPii,
  isPiiEncryptionConfigured,
  isPiiHashConfigured,
  normalizeEmailForHash,
} from "@/lib/piiCrypto";
import {
  BACKOFFICE_LEVEL,
  BACKOFFICE_READ_ONLY_ERROR,
  hasBackofficeAccess,
  type BackofficeAccess,
} from "@/lib/login/backofficeRoles";

export type BackofficeAuthUser = {
  id: string;
  supabaseUserId: string;
  email: string;
  // 승인 때 최고 관리자가 붙여 준 이름. 없을 수 있다.
  name?: string | null;
  level: number;
};

export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptionsWithName;
};

function getSupabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("SUPABASE_AUTH_CONFIG_MISSING");
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function tryDecryptBackofficeEmail(emailEncrypted: string) {
  try {
    return decryptPii(emailEncrypted);
  } catch {
    return null;
  }
}

function getAuthErrorMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === "invalid_credentials") {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  return error?.message || "SUPABASE_AUTH_FAILED";
}

function getPasswordChangeErrorCode(error: { code?: string }) {
  if (error.code === "invalid_credentials") return "CURRENT_PASSWORD_INVALID";

  if (error.code === "same_password") return "PASSWORD_UNCHANGED";
  if (error.code === "weak_password") return "PASSWORD_TOO_WEAK";
  if (error.code === "over_request_rate_limit") return "PASSWORD_CHANGE_RATE_LIMITED";
  if (error.code === "reauthentication_needed") return "REAUTHENTICATION_REQUIRED";
  if (["no_authorization", "session_expired", "session_not_found"].includes(error.code ?? "")) {
    return "UNAUTHORIZED";
  }
  return "PASSWORD_CHANGE_FAILED";
}

export async function createBackofficeSupabaseClient(
  cookiesToSet?: SupabaseCookieToSet[],
) {
  const { url, anonKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(nextCookies) {
        cookiesToSet?.push(...nextCookies);
      },
    },
  });
}

export async function signInBackofficeWithPassword(
  email: string,
  password: string,
  cookiesToSet: SupabaseCookieToSet[],
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("EMAIL_REQUIRED");
  if (!password) throw new Error("PASSWORD_REQUIRED");

  const supabase = await createBackofficeSupabaseClient(cookiesToSet);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(getAuthErrorMessage(error));
  }

  const supabaseUserId = data.user?.id?.trim();
  const verifiedEmail = normalizeEmail(data.user?.email ?? normalizedEmail);

  if (!data.session?.access_token || !supabaseUserId || !verifiedEmail) {
    throw new Error("SUPABASE_AUTH_INVALID_RESPONSE");
  }

  const emailEncrypted = encryptPii(verifiedEmail);
  const emailHash = hmacPii(normalizeEmailForHash(verifiedEmail));
  const lastLoginAt = new Date();
  const userSelect = {
    id: true,
    supabaseUserId: true,
    emailEncrypted: true,
    name: true,
    level: true,
  } as const;

  const existingUser = await prisma.backofficeUser.findUnique({
    where: { supabaseUserId },
    select: userSelect,
  });

  const user = existingUser
    ? await prisma.backofficeUser.update({
        where: { id: existingUser.id },
        data: {
          emailEncrypted,
          emailHash,
          lastLoginAt,
        },
        select: userSelect,
      })
    : await linkBackofficeUserForSupabaseSignIn({
        supabaseUserId,
        emailEncrypted,
        emailHash,
        lastLoginAt,
        userSelect,
      });

  if (!user) {
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("등록되지 않은 백오피스 계정입니다.");
  }

  return {
    id: user.id,
    supabaseUserId,
    email: decryptPii(user.emailEncrypted),
    name: user.name,
    level: user.level,
  };
}

export async function changeBackofficePassword(
  currentPassword: string,
  newPassword: string,
  cookiesToSet: SupabaseCookieToSet[],
) {
  if (!currentPassword) throw new Error("CURRENT_PASSWORD_REQUIRED");
  if (!newPassword) throw new Error("NEW_PASSWORD_REQUIRED");
  if (currentPassword === newPassword) throw new Error("PASSWORD_UNCHANGED");

  const supabase = await createBackofficeSupabaseClient(cookiesToSet);
  const { data, error: userError } = await supabase.auth.getUser();

  const userId = data.user?.id?.trim();
  const email = normalizeEmail(data.user?.email ?? "");
  if (userError || !userId || !email) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: reauthenticated, error: reauthenticationError } =
    await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
  if (reauthenticationError) {
    throw new Error(getPasswordChangeErrorCode(reauthenticationError));
  }
  if (reauthenticated.user?.id !== userId) {
    throw new Error("UNAUTHORIZED");
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(getPasswordChangeErrorCode(error));
  }
}

async function linkBackofficeUserForSupabaseSignIn({
  supabaseUserId,
  emailEncrypted,
  emailHash,
  lastLoginAt,
  userSelect,
}: {
  supabaseUserId: string;
  emailEncrypted: string;
  emailHash: string;
  lastLoginAt: Date;
  userSelect: {
    id: true;
    supabaseUserId: true;
    emailEncrypted: true;
    name: true;
    level: true;
  };
}) {
  const pendingUser = await prisma.backofficeUser.findFirst({
    where: {
      supabaseUserId: null,
      emailHash,
    },
    select: userSelect,
  });

  if (pendingUser) {
    return prisma.backofficeUser.update({
      where: { id: pendingUser.id },
      data: {
        supabaseUserId,
        emailEncrypted,
        emailHash,
        lastLoginAt,
      },
      select: userSelect,
    });
  }

  return null;
}

export async function getCurrentBackofficeUser(): Promise<BackofficeAuthUser | null> {
  const supabase = await createBackofficeSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.id) {
    return null;
  }

  const user = await prisma.backofficeUser.findUnique({
    where: { supabaseUserId: data.user.id },
    select: {
      id: true,
      supabaseUserId: true,
      emailEncrypted: true,
      name: true,
      level: true,
    },
  });

  if (!user) return null;

  const email = tryDecryptBackofficeEmail(user.emailEncrypted);
  if (email) {
    return {
      id: user.id,
      supabaseUserId: data.user.id,
      email,
      name: user.name,
    level: user.level,
    };
  }

  const supabaseEmail = normalizeEmail(data.user.email ?? "");
  if (!supabaseEmail) return null;

  if (isPiiEncryptionConfigured() && isPiiHashConfigured()) {
    await prisma.backofficeUser.update({
      where: { id: user.id },
      data: {
        emailEncrypted: encryptPii(supabaseEmail),
        emailHash: hmacPii(normalizeEmailForHash(supabaseEmail)),
      },
    });
  }

  return {
    id: user.id,
    supabaseUserId: data.user.id,
    email: supabaseEmail,
    name: user.name,
    level: user.level,
  };
}

export const BACKOFFICE_PENDING_PATH = "/signup/pending";

export async function requireBackofficeUserPage(
  nextPath: string,
  access: BackofficeAccess = "view",
): Promise<BackofficeAuthUser> {
  const user = await getCurrentBackofficeUser();

  if (!user) {
    redirect(`/login?redirect_url=${encodeURIComponent(nextPath)}`);
  }

  if (user.level === BACKOFFICE_LEVEL.PENDING) {
    redirect(BACKOFFICE_PENDING_PATH);
  }

  if (!hasBackofficeAccess(user.level, access)) {
    notFound();
  }

  return user;
}

export type BackofficeActionAuth =
  | { ok: true; user: BackofficeAuthUser }
  | { ok: false; error: string };

// 서버 액션용. 화면에서 버튼을 숨겨도 직접 호출은 막아야 하므로 모든 쓰기 액션이
// 이걸 거친다. 조회 전용 계정에는 FORBIDDEN 대신 안내 문구를 돌려준다.
export async function requireBackofficeAction(
  access: BackofficeAccess = "edit",
): Promise<BackofficeActionAuth> {
  const user = await getCurrentBackofficeUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED" };
  if (hasBackofficeAccess(user.level, access)) return { ok: true, user };
  if (access === "edit" && hasBackofficeAccess(user.level, "view")) {
    return { ok: false, error: BACKOFFICE_READ_ONLY_ERROR };
  }
  return { ok: false, error: "FORBIDDEN" };
}
