import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { SYSTEM_SETTING_KEYS, isSystemSettingEnabled } from "@/lib/backoffice/system-settings";

export const INSTALLATION_SYNC_ORDERS_ENABLED_KEY = SYSTEM_SETTING_KEYS.installationSyncOrdersEnabled;
export const INSTALLATION_DISPATCHER_ENABLED_KEY = SYSTEM_SETTING_KEYS.installationDispatcherEnabled;
export const INSTALLATION_DISPATCHER_LOCK_KEY = "installation.dispatcher";

export async function isCronJobEnabled(key: string) {
  return isSystemSettingEnabled(key);
}

export async function acquireCronJobRunLock(key: string, ttlMs: number, now = new Date()) {
  const lockedBy = randomUUID();
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const updated = await prisma.cronJobRunLock.updateMany({
    where: {
      key,
      lockedUntil: {
        lte: now,
      },
    },
    data: {
      lockedBy,
      lockedUntil,
    },
  });

  if (updated.count > 0) return lockedBy;

  try {
    await prisma.cronJobRunLock.create({
      data: {
        key,
        lockedBy,
        lockedUntil,
      },
    });
    return lockedBy;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return null;
    }

    throw error;
  }
}

export async function releaseCronJobRunLock(key: string, lockedBy: string) {
  await prisma.cronJobRunLock.updateMany({
    where: { key, lockedBy },
    data: {
      lockedBy: null,
      lockedUntil: new Date(0),
    },
  });
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
