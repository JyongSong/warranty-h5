import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import {
  fetchErpInstallationOrderRows,
  type ErpInstallationOrderRow,
} from "@/lib/installation/orders/source/fetch/query";

export type FetchInstallationOrderSourceOptions = {
  from?: string;
  to?: string;
};

export function getTodayKstOrderDate(nowUtc = new Date()) {
  const now = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10).replace(/-/g, "");
}

export function mapErpRowsToFetchedInstallationOrders(
  rows: ErpInstallationOrderRow[],
): FetchedInstallationOrder[] {
  return rows.map((row) => ({
    ...row,
    source_key: buildInstallationOrderSourceKey(row),
  }));
}

export async function fetchResolvedInstallationOrdersFromErp(
  options: FetchInstallationOrderSourceOptions = {},
): Promise<FetchedInstallationOrder[]> {
  const rows = await fetchRawInstallationOrderRowsFromErp(options);
  return mapErpRowsToFetchedInstallationOrders(rows);
}

export async function fetchRawInstallationOrderRowsFromErp(
  options: FetchInstallationOrderSourceOptions = {},
): Promise<ErpInstallationOrderRow[]> {
  const today = getTodayKstOrderDate();
  const from = options.from ?? today;
  const to = options.to ?? from;

  return fetchErpInstallationOrderRows(from, to);
}

function buildInstallationOrderSourceKey(row: ErpInstallationOrderRow) {
  return (
    normalizeSourceKeyPart(row.no_girl) ??
    normalizeSourceKeyPart(row.order_numbers) ??
    [
      row.phone?.trim() || "NO_PHONE",
      row.due_date?.trim() || "NO_DUE_DATE",
      row.address?.trim() || "NO_ADDRESS",
      row.memo?.trim() || "NO_MEMO",
    ].join("|")
  );
}

function normalizeSourceKeyPart(value: string | null | undefined) {
  const normalized = value
    ?.split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .sort()
    .join(",");

  return normalized || null;
}
