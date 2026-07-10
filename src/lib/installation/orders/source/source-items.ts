import type { FetchedInstallationOrderItem } from "@/lib/installation/orders/source/fetch/model";

const WALLPAD_ITEM_CODES = new Set(["RF447"]);
const AQARA_APP_CAPABILITIES = new Set([
  "NONE",
  "DOORLOCK_AND_APP",
  "DOORLOCK_AND_APP_AND_HUB",
]);

export type SourceItemDispatchRequirement = {
  requiredCapabilities: string[];
  requiredAqaraAppCapability: string;
};

export function resolveDispatchRequirementFromSourceItems({
  items,
  requiredAqaraAppCapability,
}: {
  items: FetchedInstallationOrderItem[];
  requiredAqaraAppCapability?: string | null;
}): SourceItemDispatchRequirement {
  const capabilities = new Set<string>();

  for (const item of items) {
    const code = normalizeItemCode(item.item_code);
    const name = item.item_name?.trim() ?? "";

    if (isDoorlockInstallItemCode(code)) {
      capabilities.add("DOORLOCK");
    }
    if (code && WALLPAD_ITEM_CODES.has(code)) {
      capabilities.add("WALLPAD_HUB");
    }
    if (/[KLU]100/.test(name)) {
      capabilities.add("DOORLOCK");
    }
    if (name.includes("월패드")) {
      capabilities.add("WALLPAD_HUB");
    }
  }

  return {
    requiredCapabilities: Array.from(capabilities),
    requiredAqaraAppCapability: normalizeAqaraAppCapability(requiredAqaraAppCapability),
  };
}

export function parseSourceItemsJsonText(value: string | null | undefined): FetchedInstallationOrderItem[] {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeSourceItem(item))
      .filter((item): item is FetchedInstallationOrderItem => item !== null);
  } catch {
    return [];
  }
}

export function parseRequiredCapabilitiesText(value: string | null | undefined) {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  } catch {
    return [];
  }
}

export function formatSourceItemsProductSummary(
  itemsJsonText: string | null | undefined,
  fallback?: string | null,
) {
  const items = parseSourceItemsJsonText(itemsJsonText);
  const summary = items
    .map((item) => {
      const name = item.item_name?.trim();
      if (!name) return null;
      const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
      return `${name} x${quantity}`;
    })
    .filter((item): item is string => item !== null)
    .join(" / ");

  return summary || fallback?.trim() || "";
}

export function serializeRequiredCapabilities(value: string[]) {
  return JSON.stringify(Array.from(new Set(value.filter(Boolean))));
}

export function inferDispatchRequirementFromMemo(
  memo: string | null | undefined,
): SourceItemDispatchRequirement {
  const normalized = memo?.trim() ?? "";
  const capabilities = new Set<string>();

  if (/도어락|[KLU]100|00012/.test(normalized)) {
    capabilities.add("DOORLOCK");
  }
  if (/월패드|허브/.test(normalized)) {
    capabilities.add("WALLPAD_HUB");
  }

  return {
    requiredCapabilities: Array.from(capabilities),
    requiredAqaraAppCapability: inferAqaraAppCapabilityFromMemo(normalized),
  };
}

function inferAqaraAppCapabilityFromMemo(normalizedMemo: string) {
  if (normalizedMemo.includes("앱+허브 설치")) return "DOORLOCK_AND_APP_AND_HUB";
  if (normalizedMemo.includes("앱 설치")) return "DOORLOCK_AND_APP";
  return "NONE";
}

function normalizeSourceItem(value: unknown): FetchedInstallationOrderItem | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  return {
    item_code: typeof item.item_code === "string" && item.item_code.trim() ? item.item_code.trim() : null,
    item_name: typeof item.item_name === "string" && item.item_name.trim() ? item.item_name.trim() : null,
    quantity: toNullableNumber(item.quantity),
  };
}

function normalizeItemCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function isDoorlockInstallItemCode(code: string | null) {
  return code?.startsWith("00012") ?? false;
}

function normalizeAqaraAppCapability(value: string | null | undefined) {
  const normalized = value?.trim() || "NONE";
  return AQARA_APP_CAPABILITIES.has(normalized) ? normalized : "NONE";
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
