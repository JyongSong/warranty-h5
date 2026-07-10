import { fetchDispatchRows } from "@/lib/dispatch";
import {
  getTodayKstOrderDate,
  mapErpRowsToFetchedInstallationOrders,
} from "@/lib/installation/orders/source/fetch/service";
import { saveFetchedInstallationOrderSources } from "@/lib/installation/orders/source/persistence";

export type SyncInstallationOrdersFromErpResult = {
  fetchedCount: number;
  savedCount: number;
};

export async function syncInstallationOrdersFromErp(): Promise<SyncInstallationOrdersFromErpResult> {
  const today = getTodayKstOrderDate();
  const rows = await fetchDispatchRows(today, today);
  const orders = mapErpRowsToFetchedInstallationOrders(rows);
  const saved = await saveFetchedInstallationOrderSources(orders);

  return {
    fetchedCount: orders.length,
    savedCount: saved.count,
  };
}
