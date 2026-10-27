import { fetchDispatchRowsByOrderNumber } from "@/lib/dispatch";
import { prisma } from "@/lib/prisma";
import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import { mapErpRowsToFetchedInstallationOrders } from "@/lib/installation/orders/source/fetch/service";
import {
  annotateFetchedInstallationOrderValidation,
  saveFetchedInstallationOrderSources,
} from "@/lib/installation/orders/source/persistence";

// ERP 동기화(오늘 납기 · 용역 품목 · 전량 출고)에 걸러진 주문을 주문번호/출고번호로
// 찾아 설치 업무 큐에 수동으로 넣는다. 저장은 동기화와 같은 경로를 써서
// source_key 가 같으면 나중에 동기화가 다시 가져와도 중복되지 않는다.

const MAX_ORDER_NUMBER_LENGTH = 50;

export type ExistingQueueOrder = {
  installationOrderId: string;
  status: string;
};

export type ErpOrderLookupItem = FetchedInstallationOrder & {
  fully_shipped: boolean;
  has_service_item: boolean;
  existing_orders: ExistingQueueOrder[];
};

export class ErpOrderManualAddError extends Error {}

export function normalizeErpOrderNumberQuery(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new ErpOrderManualAddError("ORDER_NUMBER_REQUIRED");
  if (normalized.length > MAX_ORDER_NUMBER_LENGTH) throw new ErpOrderManualAddError("ORDER_NUMBER_TOO_LONG");
  return normalized;
}

export async function lookupErpOrdersByNumber(query: string): Promise<ErpOrderLookupItem[]> {
  const orderNo = normalizeErpOrderNumberQuery(query);
  const rows = await fetchDispatchRowsByOrderNumber(orderNo);
  const orders = mapErpRowsToFetchedInstallationOrders(rows);

  return Promise.all(
    orders.map(async (order, index) => ({
      ...annotateFetchedInstallationOrderValidation(order),
      fully_shipped: rows[index].fully_shipped,
      has_service_item: rows[index].has_service_item,
      existing_orders: await findExistingQueueOrders(order),
    })),
  );
}

export async function addErpOrderToInstallationQueue({
  query,
  sourceKey,
}: {
  query: string;
  sourceKey: string;
}): Promise<{ installationOrderId: string }> {
  // 화면에서 받은 행을 그대로 믿지 않고 ERP 에서 다시 조회해 저장한다.
  const orderNo = normalizeErpOrderNumberQuery(query);
  const rows = await fetchDispatchRowsByOrderNumber(orderNo);
  const order = mapErpRowsToFetchedInstallationOrders(rows).find((item) => item.source_key === sourceKey);
  if (!order) throw new ErpOrderManualAddError("ERP_ORDER_NOT_FOUND");

  const existing = await findExistingQueueOrders(order);
  if (existing.length > 0) throw new ErpOrderManualAddError("ALREADY_IN_QUEUE");

  await saveFetchedInstallationOrderSources([order]);

  const source = await prisma.installationOrderSource.findUnique({
    where: { sourceKey: order.source_key },
    select: { order: { select: { id: true } } },
  });
  if (!source?.order) throw new ErpOrderManualAddError("QUEUE_ADD_FAILED");

  return { installationOrderId: source.order.id };
}

// 같은 주문이 다른 주문과 묶여(같은 전화번호) 이미 들어가 있으면 source_key 가
// 달라진다. 출고번호·주문번호가 겹치는 원천도 이미 들어간 것으로 본다.
async function findExistingQueueOrders(order: FetchedInstallationOrder): Promise<ExistingQueueOrder[]> {
  const noGirls = splitNumbers(order.no_girl);
  const orderNumbers = splitNumbers(order.order_numbers);

  const sources = await prisma.installationOrderSource.findMany({
    where: {
      channel: "SELF",
      OR: [
        { sourceKey: order.source_key },
        ...noGirls.map((value) => ({ noGirl: { contains: value } })),
        ...orderNumbers.map((value) => ({ orderNumbers: { contains: value } })),
      ],
    },
    select: { order: { select: { id: true, status: true } } },
  });

  return sources.flatMap((source) =>
    source.order ? [{ installationOrderId: source.order.id, status: source.order.status }] : [],
  );
}

function splitNumbers(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}
