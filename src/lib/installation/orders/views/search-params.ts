import type { BackofficeSearchParams } from "@/lib/backoffice/route";
import type { InstallationOrderSearchCondition, InstallationOrderSearchField } from "./orders";

// URL 의 searchField / searchKeyword / searchFrom / searchTo 를 검색 조건으로 바꾼다.
// 값이 빠졌거나 잘못됐으면 undefined (조건 없음).
export function parseInstallationOrderSearchCondition(
  searchParams: BackofficeSearchParams,
): InstallationOrderSearchCondition | undefined {
  const field = parseInstallationOrderSearchField(searchParams.searchField);
  if (!field) return undefined;

  if (field === "desiredInstallDate" || field === "orderDate" || field === "completedDate") {
    const from = getDateOnlySearchParam(searchParams.searchFrom);
    const to = getDateOnlySearchParam(searchParams.searchTo);
    if (!from || !to || from > to) return undefined;
    return { field, from, to };
  }

  if (field === "installerDateRange") {
    const keyword = getSingleSearchParam(searchParams.searchKeyword);
    const from = getDateOnlySearchParam(searchParams.searchFrom);
    const to = getDateOnlySearchParam(searchParams.searchTo);
    if (!keyword || !from || !to || from > to) return undefined;
    return { field, keyword, from, to };
  }

  const keyword = getSingleSearchParam(searchParams.searchKeyword);
  if (!keyword) return undefined;
  return { field, keyword };
}

export function parseInstallationOrderSearchField(
  value: string | string[] | undefined,
): InstallationOrderSearchField | null {
  const field = getSingleSearchParam(value);
  if (
    field === "desiredInstallDate" ||
    field === "customerName" ||
    field === "customerPhone" ||
    field === "orderNumber" ||
    field === "installerName" ||
    field === "installerPhone" ||
    field === "orderDate" ||
    field === "installerDateRange" ||
    field === "completedDate"
  ) {
    return field;
  }

  return null;
}

function getSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function getDateOnlySearchParam(value: string | string[] | undefined) {
  const singleValue = getSingleSearchParam(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(singleValue);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return singleValue;
}
