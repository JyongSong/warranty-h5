import type { BackofficeSearchParams } from "./route";

export const DEFAULT_HISTORY_DATE_RANGE_DAYS = 30;

export type HistoryDateRange = {
  from: string;
  to: string;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function buildDefaultHistoryDateRange(now = new Date()): HistoryDateRange {
  const today = formatKstDate(now);
  const from = formatDateOnly(addDateOnlyDays(today, -(DEFAULT_HISTORY_DATE_RANGE_DAYS - 1)));

  return {
    from,
    to: today,
  };
}

export function normalizeHistoryDateRangeSearchParams(
  searchParams: BackofficeSearchParams,
  now = new Date(),
): HistoryDateRange {
  const fallback = buildDefaultHistoryDateRange(now);
  const from = getValidDateOnlySearchParam(searchParams.from) ?? fallback.from;
  const to = getValidDateOnlySearchParam(searchParams.to) ?? fallback.to;

  if (from > to) return fallback;

  return { from, to };
}

export function toStatusChangedAtRange(range: HistoryDateRange) {
  return {
    statusChangedFrom: dateOnlyToKstStart(range.from),
    statusChangedTo: dateOnlyToKstStart(formatDateOnly(addDateOnlyDays(range.to, 1))),
  };
}

function getValidDateOnlySearchParam(value: string | string[] | undefined) {
  const singleValue = Array.isArray(value) ? value[0] : value;
  if (!singleValue || !DATE_ONLY_PATTERN.test(singleValue)) return null;

  const date = dateOnlyToUtcNoon(singleValue);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateOnly(date);
}

function formatKstDate(date: Date) {
  return formatDateOnly(new Date(date.getTime() + KST_OFFSET_MS));
}

function dateOnlyToKstStart(dateOnly: string) {
  const [year, month, day] = parseDateOnlyParts(dateOnly);
  return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS);
}

function dateOnlyToUtcNoon(dateOnly: string) {
  const [year, month, day] = parseDateOnlyParts(dateOnly);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addDateOnlyDays(dateOnly: string, days: number) {
  return new Date(dateOnlyToUtcNoon(dateOnly).getTime() + days * DAY_MS);
}

function formatDateOnly(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnlyParts(dateOnly: string) {
  const [year = "0", month = "0", day = "0"] = dateOnly.split("-");
  return [Number(year), Number(month), Number(day)] as const;
}
