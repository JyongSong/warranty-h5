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

export type BackofficeAuthUser = {
  id: string;
  supabaseUserId: string;
  email: string;
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
    level: user.level,
  };
}

export async function requireBackofficeUserPage(
  nextPath: string,
  minLevel = 1,
): Promise<BackofficeAuthUser> {
  const user = await getCurrentBackofficeUser();

  if (!user) {
    redirect(`/login?redirect_url=${encodeURIComponent(nextPath)}`);
  }

  if (user.level < minLevel) {
    notFound();
  }

  return user;
}
