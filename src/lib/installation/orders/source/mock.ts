import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import mockInstallationOrders from "./mock-installation-orders.json";

export function loadMockFetchedInstallationOrders(): FetchedInstallationOrder[] {
  return mockInstallationOrders.map((order) => ({
    source_key: order.no_girl || order.external_order_numbers || order.erp_order_no,
    customer_name: order.customer_name,
    phone: order.phone,
    address: order.address,
    order_numbers: order.external_order_numbers,
    no_girl: order.no_girl,
    due_date: order.order_date,
    memo: order.memo,
  }));
}
