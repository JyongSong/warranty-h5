"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBackofficeUser, type BackofficeAuthUser } from "@/lib/login/backofficeAuth";
import { recordBackofficeAudit } from "@/lib/backoffice/audit";
import { canManageBackofficeSettings } from "@/lib/login/backofficeRoles";
import { SYSTEM_SETTING_KEYS, validateSystemSettingValue } from "@/lib/backoffice/system-settings";

const SYSTEM_SETTINGS_PATH = "/backoffice/settings/system-settings";
const EDITABLE_SYSTEM_SETTING_KEYS = new Set<string>(Object.values(SYSTEM_SETTING_KEYS));

export type UpdateSystemSettingResult =
  | { ok: true; key: string }
  | { ok: false; error: string };

export async function updateSystemSettingAction(
  formData: FormData,
): Promise<UpdateSystemSettingResult> {
  const auth = await requireSystemSettingAdmin();
  if (!auth.ok) return auth;

  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");

  if (!key) return { ok: false, error: "SETTING_KEY_REQUIRED" };
  if (!EDITABLE_SYSTEM_SETTING_KEYS.has(key)) {
    return { ok: false, error: "SETTING_KEY_NOT_EDITABLE" };
  }
  const validatedValue = validateSystemSettingValue(key, value);
  if (!validatedValue.ok) {
    return { ok: false, error: "SETTING_VALUE_INVALID" };
  }

  try {
    const previous = await prisma.backofficeSetting.findUnique({ where: { key }, select: { value: true } });
    await prisma.backofficeSetting.upsert({
      where: { key },
      create: {
        key,
        value: validatedValue.value,
        updatedBy: auth.admin.id,
      },
      update: {
        value: validatedValue.value,
        updatedBy: auth.admin.id,
      },
    });
    await recordBackofficeAudit({
      actor: auth.admin,
      entityType: "system_setting",
      entityId: key,
      entityLabel: key,
      action: "update",
      before: { value: previous?.value ?? null },
      after: { value: validatedValue.value },
    });
    revalidatePath(SYSTEM_SETTINGS_PATH);
    return { ok: true, key };
  } catch (error) {
    console.error("[backoffice/system-settings/update]", error);
    return { ok: false, error: "SETTING_UPDATE_FAILED" };
  }
}

async function requireSystemSettingAdmin(): Promise<
  | { ok: true; admin: BackofficeAuthUser }
  | { ok: false; error: string }
> {
  const admin = await getCurrentBackofficeUser();
  if (!admin) return { ok: false, error: "UNAUTHORIZED" };
  if (!canManageBackofficeSettings(admin.level)) return { ok: false, error: "FORBIDDEN" };
  return { ok: true, admin };
}
