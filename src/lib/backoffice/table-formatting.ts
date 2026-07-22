import { formatKrPhone } from "@/lib/phone";

export function formatBackofficeText(value: unknown) {
  if (value == null) return "-";
  const text = String(value).trim();
  return text || "-";
}

export function formatBackofficePhone(value: string | null | undefined) {
  if (!value?.trim()) return "-";
  return formatKrPhone(value);
}

export function formatInstallationMatchTier(value: string | null | undefined) {
  const tierLabels: Record<string, string> = {
    EXACT_DISTRICT: "담당 지역 일치",
    PRIMARY: "담당 지역 일치",
    REGION_ONLY: "광역 지역 일치",
    NOT_MATCHED: "지역 불일치",
  };

  if (!value) return "-";
  return tierLabels[value] ?? "매칭 정보 확인 필요";
}

export function formatBackofficeDateTime(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "-";

  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const localDateTime = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (localDateTime && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return `${localDateTime[1]} ${localDateTime[2]}:${localDateTime[3]}`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;

  const koreaTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return [
    koreaTime.getUTCFullYear(),
    pad(koreaTime.getUTCMonth() + 1),
    pad(koreaTime.getUTCDate()),
  ].join("-") + ` ${pad(koreaTime.getUTCHours())}:${pad(koreaTime.getUTCMinutes())}`;
}

export function formatJsonArrayObjects(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return "-";

  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return text;

    return parsed.map((item) => formatArrayItem(item)).join("\n");
  } catch {
    return text;
  }
}

export function formatArrayLines(values: unknown[] | null | undefined, fallback?: string | null) {
  if (!values || values.length === 0) return formatBackofficeText(fallback);
  return values.map((value) => formatArrayItem(value)).join("\n");
}

function formatArrayItem(value: unknown) {
  if (!isRecord(value)) return formatBackofficeText(value);

  const values = Object.values(value)
    .map((entry) => formatBackofficeText(entry))
    .filter((entry) => entry !== "-");

  return values.length > 0 ? values.join(" | ") : "-";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
