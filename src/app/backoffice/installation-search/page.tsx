import { buildBackofficeNextPath, type BackofficeSearchParams } from "@/lib/backoffice/route";
import { redirect } from "next/navigation";
import type {
  InstallationOrderSearchCondition,
  InstallationOrderSearchField,
} from "@/lib/installation/orders/views/orders";
import { InstallationOrderListView } from "../installations/views";

interface PageProps {
  searchParams: Promise<BackofficeSearchParams>;
}

export default async function InstallationSearchPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const searchCondition = normalizeInstallationOrderSearchCondition(resolvedSearchParams);
  const tableSearchParams = normalizeInstallationOrderTableSearchParams(resolvedSearchParams, searchCondition);
  const nextPath = buildBackofficeNextPath("/backoffice/installation-search", tableSearchParams);
  if (getSingleSearchParam(resolvedSearchParams.statusView)) {
    redirect(nextPath);
  }

  return (
    <InstallationOrderListView
      basePath="/backoffice/installation-search"
      emptyMessage={searchCondition ? "검색 결과가 없습니다." : "검색 조건을 입력하세요."}
      query=""
      searchCondition={searchCondition}
      nextPath={nextPath}
      searchParams={tableSearchParams}
      showStatusFilters={false}
      requireSearchCondition
      statusView="all"
      title="주문 검색"
    />
  );
}

function normalizeInstallationOrderTableSearchParams(
  searchParams: BackofficeSearchParams,
  searchCondition: InstallationOrderSearchCondition | undefined,
) {
  const tableSearchParams: BackofficeSearchParams = { ...searchParams };
  delete tableSearchParams.view;
  delete tableSearchParams.mock;
  delete tableSearchParams.raw;
  delete tableSearchParams.q;
  delete tableSearchParams.statusView;
  delete tableSearchParams.from;
  delete tableSearchParams.to;

  if (!searchCondition) {
    delete tableSearchParams.searchField;
    delete tableSearchParams.searchKeyword;
    delete tableSearchParams.searchFrom;
    delete tableSearchParams.searchTo;
    return tableSearchParams;
  }

  tableSearchParams.searchField = searchCondition.field;
  if (searchCondition.keyword) {
    tableSearchParams.searchKeyword = searchCondition.keyword;
  } else {
    delete tableSearchParams.searchKeyword;
  }
  if (searchCondition.from) {
    tableSearchParams.searchFrom = searchCondition.from;
  } else {
    delete tableSearchParams.searchFrom;
  }
  if (searchCondition.to) {
    tableSearchParams.searchTo = searchCondition.to;
  } else {
    delete tableSearchParams.searchTo;
  }

  return tableSearchParams;
}

function normalizeInstallationOrderSearchCondition(
  searchParams: BackofficeSearchParams,
): InstallationOrderSearchCondition | undefined {
  const field = normalizeInstallationOrderSearchField(searchParams.searchField);
  if (!field) {
    return getSingleSearchParam(searchParams.searchField)
      ? undefined
      : { field: "orderDate", ...getDefaultOrderDateRange() };
  }

  if (field === "desiredInstallDate" || field === "orderDate") {
    const from = getDateOnlySearchParam(searchParams.searchFrom);
    const to = getDateOnlySearchParam(searchParams.searchTo);
    if (!from || !to) return undefined;
    if (from > to) return undefined;
    return { field, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }

  const keyword = getSingleSearchParam(searchParams.searchKeyword);
  if (!keyword) return undefined;
  return { field, keyword };
}

function normalizeInstallationOrderSearchField(value: string | string[] | undefined): InstallationOrderSearchField | null {
  const field = getSingleSearchParam(value);
  if (
    field === "desiredInstallDate" ||
    field === "customerName" ||
    field === "customerPhone" ||
    field === "orderNumber" ||
    field === "installerName" ||
    field === "installerPhone" ||
    field === "orderDate"
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
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return singleValue;
}

function getDefaultOrderDateRange(now = new Date()) {
  const today = new Date(`${getKstTodayDateString(now)}T00:00:00.000Z`);
  return {
    from: formatUtcDateOnly(addUtcDays(today, -30)),
    to: formatUtcDateOnly(today),
  };
}

function getKstTodayDateString(now = new Date()) {
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return formatUtcDateOnly(kstDate);
}

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatUtcDateOnly(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
