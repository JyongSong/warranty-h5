import { normalizePhone } from "@/lib/phone";

type InstallerBody = Record<string, unknown>;

const CAPABILITIES = ["DOORLOCK", "DOORBELL", "WALLPAD_HUB", "OTHER"] as const;
const AQARA_APP_CAPABILITIES = [
  "NONE",
  "DOORLOCK_AND_APP",
  "DOORLOCK_AND_APP_AND_HUB",
] as const;

type Capability = (typeof CAPABILITIES)[number];
type AqaraAppCapability = (typeof AQARA_APP_CAPABILITIES)[number];

function nullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function nullableInt(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const num = Number(text);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error("INVALID_NUMBER_FIELD");
  }

  return num;
}

function stringArray(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("INVALID_ARRAY_FIELD");
  }
  return value
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
}

function capabilitiesArray(value: unknown): Capability[] {
  const list = stringArray(value);
  for (const item of list) {
    if (!CAPABILITIES.includes(item as Capability)) {
      throw new Error("INVALID_CAPABILITY");
    }
  }
  return list as Capability[];
}

function aqaraAppCapability(value: unknown): AqaraAppCapability {
  if (value == null || value === "") return "NONE";
  const text = String(value);
  if (!AQARA_APP_CAPABILITIES.includes(text as AqaraAppCapability)) {
    throw new Error("INVALID_AQARA_APP_CAPABILITY");
  }
  return text as AqaraAppCapability;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("INVALID_BOOLEAN_FIELD");
}

/** 새 기사를 만들 때. 빠진 항목은 기본값으로 채운다. */
export function parseInstallerPayload(body: InstallerBody) {
  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!name) {
    throw new Error("NAME_REQUIRED");
  }

  if (phone.length < 9) {
    throw new Error("INVALID_PHONE");
  }

  return {
    name,
    phone,
    branch: nullableString(body.branch),
    region: nullableString(body.region),
    coverage: nullableString(body.coverage),
    address: nullableString(body.address),
    category: nullableString(body.category),
    ability: nullableString(body.ability),
    installCount: nullableInt(body.installCount),
    happyCallLt: nullableInt(body.happyCallLt),
    defectCount: nullableInt(body.defectCount),
    dissatisfactionNote: nullableString(body.dissatisfactionNote),
    serviceAreas: stringArray(body.serviceAreas),
    capabilities: capabilitiesArray(body.capabilities),
    aqaraAppCapability: aqaraAppCapability(body.aqaraAppCapability),
    hasAqaraHubInventory: optionalBoolean(body.hasAqaraHubInventory, false),
    asEmergencyAvailability: nullableString(body.asEmergencyAvailability),
    active: optionalBoolean(body.active, true),
  };
}

/** 각 항목을 어떻게 읽을지. 수정(PATCH)에서 키가 있을 때만 쓰인다. */
const PATCH_FIELDS = {
  name: (v: unknown) => {
    const name = String(v ?? "").trim();
    if (!name) throw new Error("NAME_REQUIRED");
    return name;
  },
  phone: (v: unknown) => {
    const phone = normalizePhone(String(v ?? ""));
    if (phone.length < 9) throw new Error("INVALID_PHONE");
    return phone;
  },
  branch: nullableString,
  region: nullableString,
  coverage: nullableString,
  address: nullableString,
  category: nullableString,
  ability: nullableString,
  installCount: nullableInt,
  happyCallLt: nullableInt,
  defectCount: nullableInt,
  dissatisfactionNote: nullableString,
  asEmergencyAvailability: nullableString,
  serviceAreas: stringArray,
  capabilities: capabilitiesArray,
  aqaraAppCapability,
  hasAqaraHubInventory: (v: unknown) => optionalBoolean(v, false),
  active: (v: unknown) => optionalBoolean(v, true),
} as const;

/**
 * 기존 기사를 수정할 때. 요청에 실제로 들어온 키만 반영한다.
 *
 * 예전에는 수정도 parseInstallerPayload 를 썼는데, 그 함수는 빠진 항목을
 * 기본값으로 채운다. 관리 화면 폼에는 담당지역·설치가능항목·연동등급·허브보유·
 * 활성 다섯 항목이 아예 없었으므로, 기사 한 명을 저장할 때마다
 *   담당지역 → 빈 배열(배차에서 사라짐), 설치가능항목 → 빈 배열,
 *   연동등급 → NONE, 허브 → false, 비활성 기사 → 강제로 활성
 * 으로 조용히 덮였다. 화면에 없는 항목이 화면 조작으로 지워지는 구조였다.
 *
 * 그래서 수정은 "보낸 것만 바꾼다" 로 못박는다. 앞으로 컬럼이 늘어도
 * 폼에 빠졌다는 이유로 데이터가 날아가지 않는다.
 *
 * inCurrentRoster 는 일부러 뺐다. 이 값은 기사 명단(엑셀) 반영 스크립트가
 * 관리하므로 손으로 고쳐도 다음 반영 때 덮어써진다.
 */
export function parseInstallerPatch(body: InstallerBody) {
  const data: Record<string, unknown> = {};

  for (const [key, read] of Object.entries(PATCH_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    data[key] = read(body[key]);
  }

  if (Object.keys(data).length === 0) {
    throw new Error("NO_FIELDS_TO_UPDATE");
  }

  return data;
}
