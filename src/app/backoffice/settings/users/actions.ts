"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  createBackofficeAuthUser,
  deleteBackofficeAuthUser,
  resetBackofficeAuthUserPassword,
} from "@/lib/login/backofficeAuthAdmin";
import { encryptPii, hmacPii, normalizeEmailForHash } from "@/lib/piiCrypto";

const BACKOFFICE_USERS_PATH = "/backoffice/settings/users";

export type BackofficeUserActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createBackofficeUserAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireBackofficeUserAdmin();
  if (!auth.ok) return auth;

  const parsed = parseBackofficeUserForm(formData);
  if (!parsed.ok) return parsed;

  let supabaseUserId: string;
  try {
    ({ supabaseUserId } = await createBackofficeAuthUser(parsed.email, parsed.password));
  } catch (error) {
    console.error("[backoffice/users/create-auth]", error);
    return { ok: false, error: "USER_AUTH_CREATE_FAILED" };
  }

  try {
    const user = await prisma.backofficeUser.create({
      data: {
        supabaseUserId,
        emailEncrypted: encryptPii(parsed.email),
        emailHash: hmacPii(normalizeEmailForHash(parsed.email)),
        level: parsed.level,
      },
      select: { id: true },
    });
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id: user.id };
  } catch (error) {
    console.error("[backoffice/users/create]", error);
    await deleteBackofficeAuthUser(supabaseUserId).catch((rollbackError) => {
      console.error("[backoffice/users/create-rollback]", rollbackError);
    });
    return { ok: false, error: "USER_CREATE_FAILED" };
  }
}

export async function updateBackofficeUserAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireBackofficeUserAdmin();
  if (!auth.ok) return auth;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "USER_ID_REQUIRED" };

  const parsed = parseBackofficeUserLevel(formData);
  if (!parsed.ok) return parsed;
  if (id === auth.admin.id && parsed.level < 1) {
    return { ok: false, error: "SELF_LEVEL_DOWN_NOT_ALLOWED" };
  }

  try {
    const user = await prisma.backofficeUser.update({
      where: { id },
      data: {
        level: parsed.level,
      },
      select: { id: true },
    });
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id: user.id };
  } catch (error) {
    console.error("[backoffice/users/update]", error);
    return { ok: false, error: "USER_UPDATE_FAILED" };
  }
}

export async function resetBackofficeUserPasswordAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireBackofficeUserAdmin();
  if (!auth.ok) return auth;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "USER_ID_REQUIRED" };

  const parsed = parsePasswordForm(formData, "newPassword", "confirmPassword");
  if (!parsed.ok) return parsed;

  try {
    const user = await prisma.backofficeUser.findUnique({
      where: { id },
      select: { id: true, supabaseUserId: true },
    });
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };
    if (!user.supabaseUserId) return { ok: false, error: "USER_AUTH_ACCOUNT_MISSING" };

    await resetBackofficeAuthUserPassword(user.supabaseUserId, parsed.password);
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id: user.id };
  } catch (error) {
    console.error("[backoffice/users/reset-password]", error);
    return { ok: false, error: "USER_PASSWORD_RESET_FAILED" };
  }
}

export async function deleteBackofficeUserAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireBackofficeUserAdmin();
  if (!auth.ok) return auth;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "USER_ID_REQUIRED" };
  if (id === auth.admin.id) return { ok: false, error: "SELF_DELETE_NOT_ALLOWED" };

  try {
    const user = await prisma.backofficeUser.findUnique({
      where: { id },
      select: { id: true, supabaseUserId: true },
    });
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };

    await prisma.backofficeUser.update({
      where: { id },
      data: { level: 0 },
    });
    if (user.supabaseUserId) {
      try {
        await deleteBackofficeAuthUser(user.supabaseUserId);
      } catch (error) {
        console.error("[backoffice/users/delete-auth]", error);
        revalidatePath(BACKOFFICE_USERS_PATH);
        return { ok: false, error: "USER_AUTH_DELETE_FAILED" };
      }
    }
    await prisma.backofficeUser.delete({ where: { id } });
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id };
  } catch (error) {
    console.error("[backoffice/users/delete]", error);
    return { ok: false, error: "USER_DELETE_FAILED" };
  }
}

function parseBackofficeUserForm(formData: FormData):
  | { ok: true; email: string; level: number; password: string }
  | { ok: false; error: string } {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rawLevel = String(formData.get("level") ?? "").trim();
  const level = Number(rawLevel);

  if (!email) return { ok: false, error: "EMAIL_REQUIRED" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "EMAIL_INVALID" };
  }
  if (!/^\d+$/.test(rawLevel) || !Number.isSafeInteger(level)) {
    return { ok: false, error: "LEVEL_INVALID" };
  }

  const password = parsePasswordForm(formData, "password", "confirmPassword");
  if (!password.ok) return password;

  return { ok: true, email, level, password: password.password };
}

function parsePasswordForm(
  formData: FormData,
  passwordField: string,
  confirmationField: string,
): { ok: true; password: string } | { ok: false; error: string } {
  const password = String(formData.get(passwordField) ?? "");
  const confirmation = String(formData.get(confirmationField) ?? "");
  if (!password) return { ok: false, error: "PASSWORD_REQUIRED" };
  if (password !== confirmation) return { ok: false, error: "PASSWORD_CONFIRMATION_MISMATCH" };
  return { ok: true, password };
}

function parseBackofficeUserLevel(
  formData: FormData,
): { ok: true; level: number } | { ok: false; error: string } {
  const rawLevel = String(formData.get("level") ?? "").trim();
  const level = Number(rawLevel);

  if (!/^\d+$/.test(rawLevel) || !Number.isSafeInteger(level)) {
    return { ok: false, error: "LEVEL_INVALID" };
  }

  return { ok: true, level };
}

async function requireBackofficeUserAdmin(): Promise<
  | { ok: true; admin: { id: string } }
  | { ok: false; error: string }
> {
  const admin = await getCurrentBackofficeUser();
  if (!admin) return { ok: false, error: "UNAUTHORIZED" };
  if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };
  return { ok: true, admin };
}
