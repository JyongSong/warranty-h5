import { prisma } from "@/lib/prisma";
import dispatcherConfig from "@/lib/installation/installer/dispatcher-config.json";

export const SYSTEM_SETTING_KEYS = {
  installationSyncOrdersEnabled: "installation.syncOrders.enabled",
  installationDispatcherEnabled: "installation.dispatcher.enabled",
  installationDispatcherLockTtlMs: "installation.dispatcher.lockTtlMs",
  installationDispatcherLimitProcessInstallationOrders:
    "installation.dispatcher.limit.processInstallationOrders",
  installationDispatcherLimitRemindCustomerRequests:
    "installation.dispatcher.limit.remindCustomerRequests",
  installationDispatcherLimitFallbackCustomerRequests:
    "installation.dispatcher.limit.fallbackCustomerRequests",
  installationDispatcherLimitDispatchReadyOrders:
    "installation.dispatcher.limit.dispatchReadyOrders",
  installationDispatcherLimitTimeoutInstallerAssignments:
    "installation.dispatcher.limit.timeoutInstallerAssignments",
  installationDispatcherLimitAlertDueSoonOrders:
    "installation.dispatcher.limit.alertDueSoonOrders",
  installationDispatcherLimitSendInstallationNotifications:
    "installation.dispatcher.limit.sendInstallationNotifications",
  installationCustomerInputRequestMode: "installation.sms.customerInputRequestMode",
  installationSmsDeliveryMode: "installation.sms.deliveryMode",
  installationSmsTestPhoneNumber: "installation.sms.testPhoneNumber",
  installationSmsSendWindowStart: "installation.sms.sendWindowStart",
  installationSmsSendWindowEnd: "installation.sms.sendWindowEnd",
} as const;

type SystemSettingRow = {
  key: string;
  value: string;
};

export type SystemSettingListItem = SystemSettingRow & {
  description: string;
  effectiveValue: string;
  valueStatus: "stored" | "missing" | "invalid";
  validationHint: string;
};

type SystemSettingSpec = {
  key: string;
  description: string;
  validationHint: string;
} & (
  | { type: "boolean"; defaultValue: "false" }
  | { type: "enum"; allowedValues: readonly string[]; defaultValue: string }
  | { type: "integer"; min: number; max: number; defaultValue: number }
  | { type: "time"; defaultValue: string }
  | { type: "phoneList"; defaultValue: "" }
);

const dispatcherLimitSpecs: SystemSettingSpec[] = Object.entries(dispatcherConfig.limits).map(([, spec]) => ({
  key: spec.key,
  description: spec.description,
  type: "integer" as const,
  min: spec.min,
  max: spec.max,
  defaultValue: spec.default,
  validationHint: `${spec.min}-${spec.max} 사이의 정수`,
}));

const SYSTEM_SETTING_SPECS = ([
  {
    key: SYSTEM_SETTING_KEYS.installationSyncOrdersEnabled,
    description: "설치 주문 동기화 cron 실행 여부",
    type: "boolean" as const,
    defaultValue: "false",
    validationHint: "true 또는 false",
  },
  {
    key: SYSTEM_SETTING_KEYS.installationDispatcherEnabled,
    description: dispatcherConfig.enabled.description,
    type: "boolean" as const,
    defaultValue: "false",
    validationHint: "true 또는 false",
  },
  {
    key: dispatcherConfig.customerInputRequestMode.key,
    description: dispatcherConfig.customerInputRequestMode.description,
    type: "enum" as const,
    allowedValues: ["auto", "manual"],
    defaultValue: dispatcherConfig.customerInputRequestMode.default,
    validationHint: "auto 또는 manual",
  },
  {
    key: dispatcherConfig.lockTtlMs.key,
    description: dispatcherConfig.lockTtlMs.description,
    type: "integer" as const,
    min: dispatcherConfig.lockTtlMs.min,
    max: dispatcherConfig.lockTtlMs.max,
    defaultValue: dispatcherConfig.lockTtlMs.default,
    validationHint: `${dispatcherConfig.lockTtlMs.min}-${dispatcherConfig.lockTtlMs.max} 사이의 정수`,
  },
  ...dispatcherLimitSpecs,
  {
    key: dispatcherConfig.smsSendWindow.start.key,
    description: dispatcherConfig.smsSendWindow.start.description,
    type: "time" as const,
    defaultValue: dispatcherConfig.smsSendWindow.start.default,
    validationHint: "00:00-23:59 형식(HH:mm)",
  },
  {
    key: dispatcherConfig.smsSendWindow.end.key,
    description: dispatcherConfig.smsSendWindow.end.description,
    type: "time" as const,
    defaultValue: dispatcherConfig.smsSendWindow.end.default,
    validationHint: "00:00-23:59 형식(HH:mm)",
  },
  {
    key: SYSTEM_SETTING_KEYS.installationSmsDeliveryMode,
    description: "설치 문자 발송 상태(disabled/test/production)",
    type: "enum" as const,
    allowedValues: ["disabled", "test", "production"],
    defaultValue: "disabled",
    validationHint: "disabled, test, production 중 하나",
  },
  {
    key: SYSTEM_SETTING_KEYS.installationSmsTestPhoneNumber,
    description: "테스트 발송 수신 번호",
    type: "phoneList" as const,
    defaultValue: "",
    validationHint: "전화번호. 여러 번호는 콤마, 세미콜론, 줄바꿈으로 구분",
  },
] satisfies SystemSettingSpec[]).sort((left, right) => left.key.localeCompare(right.key));

const systemSettingSpecByKey = new Map(SYSTEM_SETTING_SPECS.map((spec) => [spec.key, spec]));

export async function listSystemSettings(): Promise<SystemSettingListItem[]> {
  const settings = await prisma.$queryRaw<SystemSettingRow[]>`
    select
      "key",
      "value"::text as "value"
    from "backoffice_settings"
    order by "key" asc
  `;
  const settingByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return SYSTEM_SETTING_SPECS.map((spec) => {
    const value = settingByKey.get(spec.key);
    const normalized = value === undefined ? null : validateSystemSettingValue(spec.key, value);
    const valueStatus: SystemSettingListItem["valueStatus"] =
      value === undefined ? "missing" : normalized?.ok ? "stored" : "invalid";

    return {
      key: spec.key,
      value: value ?? "",
      description: spec.description,
      effectiveValue: getEffectiveSystemSettingValue(spec, normalized?.ok ? normalized.value : null),
      valueStatus,
      validationHint: spec.validationHint,
    };
  });
}

export async function isSystemSettingEnabled(key: string) {
  const setting = await prisma.backofficeSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  return setting?.value === "true";
}

export async function getSystemSettingValue(key: string): Promise<string | null> {
  const setting = await prisma.backofficeSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  return setting?.value ?? null;
}

export function getSystemSettingDescription(key: string) {
  return systemSettingSpecByKey.get(key)?.description ?? "-";
}

export function validateSystemSettingValue(key: string, rawValue: string) {
  const spec = systemSettingSpecByKey.get(key);
  if (!spec) return { ok: false as const };

  const value = rawValue.trim();

  if (spec.type === "boolean") {
    return value === "true" || value === "false"
      ? { ok: true as const, value }
      : { ok: false as const };
  }

  if (spec.type === "enum") {
    return spec.allowedValues.includes(value)
      ? { ok: true as const, value }
      : { ok: false as const };
  }

  if (spec.type === "integer") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= spec.min && parsed <= spec.max
      ? { ok: true as const, value: String(parsed) }
      : { ok: false as const };
  }

  if (spec.type === "time") {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
      ? { ok: true as const, value }
      : { ok: false as const };
  }

  const recipients = value
    .split(/[,\n;]/)
    .map((recipient) => recipient.replace(/\D/g, ""))
    .filter((recipient) => recipient !== "");

  return recipients.length > 0 ? { ok: true as const, value } : { ok: false as const };
}

function getEffectiveSystemSettingValue(spec: SystemSettingSpec, value: string | null) {
  if (value !== null) return value;
  if (spec.type === "integer") return String(spec.defaultValue);
  return spec.defaultValue || "-";
}
