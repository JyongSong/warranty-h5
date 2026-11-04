"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeAction, type BackofficeAuthUser } from "@/lib/login/backofficeAuth";
import {
  BACKOFFICE_LEVEL,
  formatBackofficeLevel,
  isAssignableBackofficeLevel,
} from "@/lib/login/backofficeRoles";
import {
  createBackofficeAuthUser,
  deleteBackofficeAuthUser,
  resetBackofficeAuthUserPassword,
} from "@/lib/login/backofficeAuthAdmin";
import { decryptPii, encryptPii, hmacPii, normalizeEmailForHash } from "@/lib/piiCrypto";
import { recordBackofficeAudit } from "@/lib/backoffice/audit";

const BACKOFFICE_USERS_PATH = "/backoffice/settings/users";
const NAME_MAX_LENGTH = 50;

export type BackofficeUserActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type UserSnapshot = { email: string; name: string | null; level: string };

function snapshot(user: { emailEncrypted: string; name: string | null; level: number }): UserSnapshot {
  return {
    email: tryDecrypt(user.emailEncrypted),
    name: user.name,
    level: formatBackofficeLevel(user.level),
  };
}

function tryDecrypt(value: string) {
  try {
    return decryptPii(value);
  } catch {
    return "(복호화 실패)";
  }
}

const userAuditSelect = {
  id: true,
  supabaseUserId: true,
  emailEncrypted: true,
  name: true,
  level: true,
} as const;

export async function createBackofficeUserAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireUserManager();
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
        name: parsed.name,
        level: parsed.level,
      },
      select: userAuditSelect,
    });
    await recordBackofficeAudit({
      actor: auth.user,
      entityType: "backoffice_user",
      entityId: user.id,
      entityLabel: parsed.email,
      action: "create",
      after: snapshot(user),
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

// 등급·이름 수정. 승인 대기(0) 유저에게 쓰면 그대로 가입 승인이 된다.
export async function updateBackofficeUserAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireUserManager();
  if (!auth.ok) return auth;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "USER_ID_REQUIRED" };

  const level = parseAssignableLevel(formData);
  if (!level.ok) return level;
  const name = parseName(formData);
  if (!name.ok) return name;

  if (id === auth.user.id && level.level !== BACKOFFICE_LEVEL.SUPER_ADMIN) {
    return { ok: false, error: "SELF_LEVEL_DOWN_NOT_ALLOWED" };
  }

  try {
    const before = await prisma.backofficeUser.findUnique({ where: { id }, select: userAuditSelect });
    if (!before) return { ok: false, error: "USER_NOT_FOUND" };

    const after = await prisma.backofficeUser.update({
      where: { id },
      data: { level: level.level, name: name.name },
      select: userAuditSelect,
    });
    await recordBackofficeAudit({
      actor: auth.user,
      entityType: "backoffice_user",
      entityId: id,
      entityLabel: tryDecrypt(after.emailEncrypted),
      action: before.level === BACKOFFICE_LEVEL.PENDING ? "approve" : "update",
      before: snapshot(before),
      after: snapshot(after),
    });
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id };
  } catch (error) {
    console.error("[backoffice/users/update]", error);
    return { ok: false, error: "USER_UPDATE_FAILED" };
  }
}

export async function resetBackofficeUserPasswordAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireUserManager();
  if (!auth.ok) return auth;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "USER_ID_REQUIRED" };

  const parsed = parsePasswordForm(formData, "newPassword", "confirmPassword");
  if (!parsed.ok) return parsed;

  try {
    const user = await prisma.backofficeUser.findUnique({ where: { id }, select: userAuditSelect });
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };
    if (!user.supabaseUserId) return { ok: false, error: "USER_AUTH_ACCOUNT_MISSING" };

    await resetBackofficeAuthUserPassword(user.supabaseUserId, parsed.password);
    await recordBackofficeAudit({
      actor: auth.user,
      entityType: "backoffice_user",
      entityId: id,
      entityLabel: tryDecrypt(user.emailEncrypted),
      action: "reset_password",
    });
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id: user.id };
  } catch (error) {
    console.error("[backoffice/users/reset-password]", error);
    return { ok: false, error: "USER_PASSWORD_RESET_FAILED" };
  }
}

// 삭제. 승인 대기 유저에게 쓰면 가입 거절로 기록한다.
export async function deleteBackofficeUserAction(
  formData: FormData,
): Promise<BackofficeUserActionResult> {
  const auth = await requireUserManager();
  if (!auth.ok) return auth;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "USER_ID_REQUIRED" };
  if (id === auth.user.id) return { ok: false, error: "SELF_DELETE_NOT_ALLOWED" };

  try {
    const user = await prisma.backofficeUser.findUnique({ where: { id }, select: userAuditSelect });
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };

    await prisma.backofficeUser.update({
      where: { id },
      data: { level: BACKOFFICE_LEVEL.PENDING },
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
    await recordBackofficeAudit({
      actor: auth.user,
      entityType: "backoffice_user",
      entityId: id,
      entityLabel: tryDecrypt(user.emailEncrypted),
      action: user.level === BACKOFFICE_LEVEL.PENDING ? "reject" : "delete",
      before: snapshot(user),
    });
    revalidatePath(BACKOFFICE_USERS_PATH);
    return { ok: true, id };
  } catch (error) {
    console.error("[backoffice/users/delete]", error);
    return { ok: false, error: "USER_DELETE_FAILED" };
  }
}

function parseBackofficeUserForm(formData: FormData):
  | { ok: true; email: string; level: number; name: string | null; password: string }
  | { ok: false; error: string } {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) return { ok: false, error: "EMAIL_REQUIRED" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "EMAIL_INVALID" };
  }

  const level = parseAssignableLevel(formData);
  if (!level.ok) return level;
  const name = parseName(formData);
  if (!name.ok) return name;

  const password = parsePasswordForm(formData, "password", "confirmPassword");
  if (!password.ok) return password;

  return { ok: true, email, level: level.level, name: name.name, password: password.password };
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

function parseAssignableLevel(
  formData: FormData,
): { ok: true; level: number } | { ok: false; error: string } {
  const rawLevel = String(formData.get("level") ?? "").trim();
  const level = Number(rawLevel);

  if (!/^\d+$/.test(rawLevel) || !isAssignableBackofficeLevel(level)) {
    return { ok: false, error: "LEVEL_INVALID" };
  }

  return { ok: true, level };
}

function parseName(
  formData: FormData,
): { ok: true; name: string | null } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length > NAME_MAX_LENGTH) return { ok: false, error: "NAME_TOO_LONG" };
  return { ok: true, name: name || null };
}

async function requireUserManager(): Promise<
  { ok: true; user: BackofficeAuthUser } | { ok: false; error: string }
> {
  return requireBackofficeAction("settings");
}
