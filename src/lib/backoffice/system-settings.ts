import { prisma } from "@/lib/prisma";
import dispatcherConfig from "@/lib/installation/installer/dispatcher-config.json";

export const SYSTEM_SETTING_KEYS = {
  backofficeAssignmentSmsMaxFileBytes: "backoffice.sms.assignment.maxFileBytes",
  backofficeAssignmentSmsMaxRecipientsPerRequest:
    "backoffice.sms.assignment.maxRecipientsPerRequest",
  backofficeAssignmentSmsMaxRecipientsPerDay:
    "backoffice.sms.assignment.maxRecipientsPerDay",
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
  // P4 정산: global default rates (KRW). Per-installer overrides live in installer_rates.
  settlementLinkageAppFee: "installation.settlement.linkageAppFee",
  settlementLinkageHubFee: "installation.settlement.linkageHubFee",
  settlementTravelFee: "installation.settlement.travelFee",
  settlementNightSurcharge: "installation.settlement.nightSurcharge",
  settlementWeekendSurcharge: "installation.settlement.weekendSurcharge",
  settlementNightStartHour: "installation.settlement.nightStartHour",
  settlementNightEndHour: "installation.settlement.nightEndHour",
} as const;

export const ASSIGNMENT_SMS_LIMIT_DEFAULTS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxRecipientsPerRequest: 500,
  maxRecipientsPerDay: 1000,
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
    key: SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxFileBytes,
    description: "백오피스 수동 SMS 업로드 파일 최대 크기(byte)",
    type: "integer" as const,
    min: 1024,
    max: 20 * 1024 * 1024,
    defaultValue: ASSIGNMENT_SMS_LIMIT_DEFAULTS.maxFileBytes,
    validationHint: `1024-${20 * 1024 * 1024} 사이의 정수(byte)`,
  },
  {
    key: SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerRequest,
    description: "백오피스 수동 SMS 요청당 최대 수신자 수",
    type: "integer" as const,
    min: 1,
    max: 5000,
    defaultValue: ASSIGNMENT_SMS_LIMIT_DEFAULTS.maxRecipientsPerRequest,
    validationHint: "1-5000 사이의 정수",
  },
  {
    key: SYSTEM_SETTING_KEYS.backofficeAssignmentSmsMaxRecipientsPerDay,
    description: "백오피스 수동 SMS 일일 최대 발송 시도 수(KST)",
    type: "integer" as const,
    min: 1,
    max: 50000,
    defaultValue: ASSIGNMENT_SMS_LIMIT_DEFAULTS.maxRecipientsPerDay,
    validationHint: "1-50000 사이의 정수",
  },
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
  {
    key: SYSTEM_SETTING_KEYS.settlementLinkageAppFee,
    description: "정산 기본 연동비 - APP 등급(원). 기사별 재정의 없으면 이 값 사용",
    type: "integer" as const,
    min: 0,
    max: 10000000,
    defaultValue: 0,
    validationHint: "0-10000000 사이의 정수(원)",
  },
  {
    key: SYSTEM_SETTING_KEYS.settlementLinkageHubFee,
    description: "정산 기본 연동비 - 허브 등급(원, APP 포함). 허브 달성 시 이 값으로 대체",
    type: "integer" as const,
    min: 0,
    max: 10000000,
    defaultValue: 0,
    validationHint: "0-10000000 사이의 정수(원)",
  },
  {
    key: SYSTEM_SETTING_KEYS.settlementTravelFee,
    description: "정산 기본 출장비(원, 설치 완료 건당 고정)",
    type: "integer" as const,
    min: 0,
    max: 10000000,
    defaultValue: 0,
    validationHint: "0-10000000 사이의 정수(원)",
  },
  {
    key: SYSTEM_SETTING_KEYS.settlementNightSurcharge,
    description: "정산 야간 할증(원, 설치 종료시각이 야간대일 때 가산)",
    type: "integer" as const,
    min: 0,
    max: 10000000,
    defaultValue: 0,
    validationHint: "0-10000000 사이의 정수(원)",
  },
  {
    key: SYSTEM_SETTING_KEYS.settlementWeekendSurcharge,
    description: "정산 주말 할증(원, 설치 종료일이 토/일일 때 가산)",
    type: "integer" as const,
    min: 0,
    max: 10000000,
    defaultValue: 0,
    validationHint: "0-10000000 사이의 정수(원)",
  },
  {
    key: SYSTEM_SETTING_KEYS.settlementNightStartHour,
    description: "야간 시작 시각(KST 0-23시). 설치 종료시각 hour >= 이 값이면 야간",
    type: "integer" as const,
    min: 0,
    max: 23,
    defaultValue: 20,
    validationHint: "0-23 사이의 정수(시)",
  },
  {
    key: SYSTEM_SETTING_KEYS.settlementNightEndHour,
    description: "야간 종료 시각(KST 0-23시). 설치 종료시각 hour < 이 값이면 야간",
    type: "integer" as const,
    min: 0,
    max: 23,
    defaultValue: 6,
    validationHint: "0-23 사이의 정수(시)",
  },
] satisfies SystemSettingSpec[]).sort((left, right) => left.key.localeCompare(right.key));

const systemSettingSpecByKey = new Map(SYSTEM_SETTING_SPECS.map((spec) => [spec.key, spec]));

export async function listSystemSettings(): Promise<SystemSettingListItem[]> {
  const settings = await prisma.backofficeSetting.findMany({
    where: {
      key: { in: SYSTEM_SETTING_SPECS.map((spec) => spec.key) },
    },
    select: { key: true, value: true },
    orderBy: { key: "asc" },
  });
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

// Reads the effective integer value for an integer-typed setting: the stored
// value if valid, otherwise the spec default. Throws if the key is not an
// integer spec (programmer error).
export async function getEffectiveIntegerSetting(key: string): Promise<number> {
  const spec = systemSettingSpecByKey.get(key);
  if (!spec || spec.type !== "integer") {
    throw new Error(`getEffectiveIntegerSetting: ${key} is not an integer setting`);
  }
  const stored = await getSystemSettingValue(key);
  if (stored !== null) {
    const normalized = validateSystemSettingValue(key, stored);
    if (normalized.ok) return Number(normalized.value);
  }
  return spec.defaultValue;
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
