import crypto from "crypto";
import { Prisma } from "@prisma/client";
import {
  ASSIGNMENT_SMS_LIMIT_DEFAULTS,
  SYSTEM_SETTING_KEYS,
  validateSystemSettingValue,
} from "@/lib/backoffice/system-settings";
import { prisma } from "@/lib/prisma";

const DAILY_USAGE_KEY_PREFIX = "backoffice.sms.assignment.dailyUsage.";
const AUDIT_KEY_PREFIX = "backoffice.sms.assignment.audit.";

export type AssignmentSmsLimits = {
  maxFileBytes: number;
  maxRecipientsPerRequest: number;
  maxRecipientsPerDay: number;
};

export class AssignmentSmsSecurityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "AssignmentSmsSecurityError";
  }
}

type AssignmentSmsAuditRecord = {
  schemaVersion: 1;
  adminId: string;
  fileName: string;
  recipientCount: number;
  templateKey: string;
  templateBodyHash: string;
  status: "RESERVED" | "COMPLETED" | "COMPLETED_WITH_ERRORS";
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
};

export async function getAssignmentSmsLimits(): Promise<AssignmentSmsLimits> {
  const keys = [
    SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxFileBytes,
    SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerRequest,
    SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerDay,
  ];
  const settings = await prisma.backofficeSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const settingByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    maxFileBytes: resolveIntegerSetting(
      SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxFileBytes,
      settingByKey.get(SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxFileBytes),
      ASSIGNMENT_SMS_LIMIT_DEFAULTS.maxFileBytes,
    ),
    maxRecipientsPerRequest: resolveIntegerSetting(
      SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerRequest,
      settingByKey.get(SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerRequest),
      ASSIGNMENT_SMS_LIMIT_DEFAULTS.maxRecipientsPerRequest,
    ),
    maxRecipientsPerDay: resolveIntegerSetting(
      SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerDay,
      settingByKey.get(SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerDay),
      ASSIGNMENT_SMS_LIMIT_DEFAULTS.maxRecipientsPerDay,
    ),
  };
}

export function validateAssignmentSmsUpload(
  input: { fileSize: number; rowCount?: number },
  limits: AssignmentSmsLimits,
) {
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize < 0) {
    throw new AssignmentSmsSecurityError("SMS_FILE_SIZE_INVALID", 400);
  }
  if (input.fileSize > limits.maxFileBytes) {
    throw new AssignmentSmsSecurityError("SMS_FILE_TOO_LARGE", 413);
  }
  if (
    input.rowCount !== undefined &&
    (!Number.isSafeInteger(input.rowCount) || input.rowCount < 0)
  ) {
    throw new AssignmentSmsSecurityError("SMS_RECIPIENT_COUNT_INVALID", 400);
  }
  if (
    input.rowCount !== undefined &&
    input.rowCount > limits.maxRecipientsPerRequest
  ) {
    throw new AssignmentSmsSecurityError("SMS_RECIPIENT_LIMIT_EXCEEDED", 413);
  }
}

export function getKstUsageDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(now);
}

export async function reserveAssignmentSmsDispatch(input: {
  adminId: string;
  fileName: string;
  recipientCount: number;
  templateBody: string;
  templateKey: string;
  maxRecipientsPerDay: number;
  now?: Date;
}) {
  if (input.recipientCount <= 0) return null;
  if (input.recipientCount > input.maxRecipientsPerDay) {
    throw new AssignmentSmsSecurityError("SMS_DAILY_LIMIT_EXCEEDED", 429);
  }

  const usageDate = getKstUsageDate(input.now);
  const now = input.now ?? new Date();
  const usageKey = `${DAILY_USAGE_KEY_PREFIX}${usageDate}`;
  const auditKey = `${AUDIT_KEY_PREFIX}${crypto.randomUUID()}`;
  const templateBodyHash = crypto.createHash("sha256").update(input.templateBody).digest("hex");
  const auditRecord: AssignmentSmsAuditRecord = {
    schemaVersion: 1,
    adminId: input.adminId,
    fileName: input.fileName,
    recipientCount: input.recipientCount,
    templateKey: input.templateKey,
    templateBodyHash,
    status: "RESERVED",
    sentCount: 0,
    failedCount: 0,
    createdAt: now.toISOString(),
    completedAt: null,
  };

  return prisma.$transaction(async (tx) => {
    const usage = await tx.$queryRaw<Array<{ value: string }>>(Prisma.sql`
      INSERT INTO "backoffice_settings" (
        "key",
        "value",
        "created_at",
        "updated_at",
        "updated_by"
      ) VALUES (
        ${usageKey},
        ${String(input.recipientCount)},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        ${input.adminId}
      )
      ON CONFLICT ("key") DO UPDATE
      SET
        "value" = (
          CAST("backoffice_settings"."value" AS BIGINT) + ${input.recipientCount}
        )::text,
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = ${input.adminId}
      WHERE "backoffice_settings"."value" ~ '^[0-9]+$'
        AND CAST("backoffice_settings"."value" AS BIGINT) + ${input.recipientCount} <= ${input.maxRecipientsPerDay}
      RETURNING "value"
    `);

    if (usage.length === 0) {
      throw new AssignmentSmsSecurityError("SMS_DAILY_LIMIT_EXCEEDED", 429);
    }

    await tx.backofficeSetting.create({
      data: {
        key: auditKey,
        value: JSON.stringify(auditRecord),
        updatedBy: input.adminId,
      },
    });

    return { key: auditKey };
  });
}

export async function finishAssignmentSmsDispatch(input: {
  auditKey: string;
  sentCount: number;
  failedCount: number;
}) {
  const setting = await prisma.backofficeSetting.findUnique({
    where: { key: input.auditKey },
    select: { value: true },
  });
  if (!setting) throw new Error("SMS_AUDIT_RECORD_NOT_FOUND");

  const previous = JSON.parse(setting.value) as AssignmentSmsAuditRecord;
  const status = input.failedCount > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await prisma.backofficeSetting.update({
    where: { key: input.auditKey },
    data: {
      value: JSON.stringify({
        ...previous,
        sentCount: input.sentCount,
        failedCount: input.failedCount,
        status,
        completedAt: new Date().toISOString(),
      } satisfies AssignmentSmsAuditRecord),
    },
  });
}

function resolveIntegerSetting(key: string, rawValue: string | undefined, fallback: number) {
  if (rawValue === undefined) return fallback;
  const validated = validateSystemSettingValue(key, rawValue);
  return validated.ok ? Number(validated.value) : fallback;
}
