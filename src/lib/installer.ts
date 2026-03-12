import { normalizePhone } from "@/lib/phone";

type InstallerBody = Record<string, unknown>;

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
  };
}
