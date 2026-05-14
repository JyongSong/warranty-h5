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
    active: optionalBoolean(body.active, true),
  };
}
