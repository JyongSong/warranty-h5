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

function getAuthErrorMessage(error: { message?: string } | null) {
  return error?.message || "SUPABASE_AUTH_FAILED";
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
    : await linkOrCreateBackofficeUserForSupabaseSignIn({
        supabaseUserId,
        emailEncrypted,
        emailHash,
        lastLoginAt,
        userSelect,
      });

  const { emailEncrypted: nextEmailEncrypted, ...userFields } = user;
  return { ...userFields, supabaseUserId, email: decryptPii(nextEmailEncrypted) };
}

async function linkOrCreateBackofficeUserForSupabaseSignIn({
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

  return prisma.backofficeUser.create({
    data: {
      supabaseUserId,
      emailEncrypted,
      emailHash,
      level: 0,
      lastLoginAt,
    },
    select: userSelect,
  });
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

  const { emailEncrypted, ...userFields } = user;
  const email = tryDecryptBackofficeEmail(emailEncrypted);
  if (email) return { ...userFields, supabaseUserId: data.user.id, email };

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

  return { ...userFields, supabaseUserId: data.user.id, email: supabaseEmail };
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
