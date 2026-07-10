import type { ColumnDef } from "@tanstack/react-table";
import type { BackofficeSearchParams } from "@/lib/backoffice/route";

export const BACKOFFICE_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
export type BackofficePageSize = (typeof BACKOFFICE_PAGE_SIZE_OPTIONS)[number];

export function normalizeBackofficeTableParams(searchParams: BackofficeSearchParams) {
  const page = parsePositiveInt(getSingleSearchParam(searchParams.page), 1);
  const requestedPageSize = parsePositiveInt(getSingleSearchParam(searchParams.pageSize), 20);
  const pageSize = BACKOFFICE_PAGE_SIZE_OPTIONS.includes(requestedPageSize as BackofficePageSize)
    ? (requestedPageSize as BackofficePageSize)
    : 20;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function buildBackofficeTableHref(
  pathname: string,
  {
    currentParams,
    page,
    pageSize,
  }: {
    currentParams: BackofficeSearchParams;
    page: number;
    pageSize: number;
  },
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(currentParams)) {
    if (key === "page" || key === "pageSize") continue;

    if (typeof value === "string" && value.trim()) {
      query.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.trim()) query.append(key, item);
      }
    }
  }

  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  return `${pathname}?${query.toString()}`;
}

export function reorderColumnIds(columnIds: string[], draggedColumnId: string, targetColumnId: string) {
  if (draggedColumnId === targetColumnId) return columnIds;
  if (!columnIds.includes(draggedColumnId) || !columnIds.includes(targetColumnId)) return columnIds;

  const nextColumnIds = columnIds.filter((columnId) => columnId !== draggedColumnId);
  const targetIndex = nextColumnIds.indexOf(targetColumnId);
  nextColumnIds.splice(targetIndex, 0, draggedColumnId);

  return nextColumnIds;
}

export function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export type BackofficeTablePreferences = {
  columnVisibility?: Record<string, boolean>;
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  sorting?: Array<{
    id: string;
    desc: boolean;
  }>;
};

export function parseTablePreferences(value: string | null | undefined): BackofficeTablePreferences {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return {};

    return {
      ...(isBooleanRecord(parsed.columnVisibility) ? { columnVisibility: parsed.columnVisibility } : {}),
      ...(isStringArray(parsed.columnOrder) ? { columnOrder: parsed.columnOrder } : {}),
      ...(isNumberRecord(parsed.columnSizing) ? { columnSizing: parsed.columnSizing } : {}),
      ...(isSortingArray(parsed.sorting) ? { sorting: parsed.sorting } : {}),
    };
  } catch {
    return {};
  }
}

export function stringifyTablePreferences(preferences: BackofficeTablePreferences) {
  return JSON.stringify({
    columnVisibility: preferences.columnVisibility ?? {},
    columnOrder: preferences.columnOrder ?? [],
    columnSizing: preferences.columnSizing ?? {},
    sorting: preferences.sorting ?? [],
  });
}

export function normalizeTablePreferenceColumnOrder(
  savedColumnOrder: string[],
  currentColumnIds: string[],
  lockedLeadingColumnIds: string[] = [],
) {
  const currentColumnIdSet = new Set(currentColumnIds);
  const lockedLeadingColumnIdSet = new Set(lockedLeadingColumnIds);
  const compatibleLockedLeadingColumnIds = lockedLeadingColumnIds.filter((columnId) =>
    currentColumnIdSet.has(columnId),
  );
  const compatibleSavedColumnIds = savedColumnOrder.filter(
    (columnId) => currentColumnIdSet.has(columnId) && !lockedLeadingColumnIdSet.has(columnId),
  );
  const savedColumnIdSet = new Set(compatibleSavedColumnIds);
  const newColumnIds = currentColumnIds.filter(
    (columnId) => !savedColumnIdSet.has(columnId) && !lockedLeadingColumnIdSet.has(columnId),
  );

  return [...compatibleLockedLeadingColumnIds, ...compatibleSavedColumnIds, ...newColumnIds];
}

export function normalizeTablePreferenceSorting(
  savedSorting: Array<{ id: string; desc: boolean }>,
  currentColumnIds: string[],
) {
  const currentColumnIdSet = new Set(currentColumnIds);
  return savedSorting.filter((sort) => currentColumnIdSet.has(sort.id));
}

export function getBackofficeTableLeafColumnIds<TData>(columnDefs: ColumnDef<TData>[]): string[] {
  return columnDefs.flatMap((column) => {
    const childColumns = (column as { columns?: ColumnDef<TData>[] }).columns;
    if (childColumns) return getBackofficeTableLeafColumnIds(childColumns);

    const accessorKey = (column as { accessorKey?: string | number }).accessorKey;
    return [column.id ?? String(accessorKey)];
  });
}

export function getBackofficeTableColumnHeaderLabel<TData>(header: ColumnDef<TData>["header"]) {
  return typeof header === "string" ? header : "컬럼";
}

function getSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "boolean");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSortingArray(value: unknown): value is Array<{ id: string; desc: boolean }> {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry.id === "string" && typeof entry.desc === "boolean")
  );
}
