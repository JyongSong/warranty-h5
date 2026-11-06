import { prisma } from "@/lib/prisma";
import {
  cjSyncDateRange,
  fetchCjDeliveryList,
  toCjManifestRow,
  type CjApiConfig,
  type CjDeliveryRow,
} from "@/lib/installation/cj/cj-api";

// CJ 담당자가 손으로 올리던 주문번호 명단을 CJ API 에서 직접 가져온다.
// 출고(4)·배송완료(5) 된 일반 주문을 출고일 기준으로 최근 며칠치 조회해
// cj_order_manifests 에 넣는다. 수동 업로드와 같은 테이블·같은 규칙
// (skipDuplicates: 이미 있는 번호, 특히 이미 제출에 쓰인 번호는 건드리지 않음)이라
// 고객 입력 쪽은 바꿀 것이 없다. 수동 업로드도 그대로 쓸 수 있다.

export const CJ_API_SYNC_UPLOADED_BY = "CJ API 자동";
export const CJ_API_SYNC_DEFAULT_LOOKBACK_DAYS = 7;

export type CjApiSyncResult = {
  startDate: string;
  endDate: string;
  fetchedRows: number;
  uniqueOrderNos: number;
  insertedCount: number;
  duplicateCount: number;
  invalidCount: number;
  uploadId: string | null;
  // dryRun 일 때만: 조회된 번호 앞 몇 개(연결 확인용)
  sampleOrderNos?: string[];
};

type FetchDeliveryList = (
  config: CjApiConfig,
  query: Parameters<typeof fetchCjDeliveryList>[1],
) => Promise<CjDeliveryRow[]>;

export async function syncCjManifestFromApi(
  config: CjApiConfig,
  {
    now = new Date(),
    lookbackDays = CJ_API_SYNC_DEFAULT_LOOKBACK_DAYS,
    fetchList = fetchCjDeliveryList,
    dryRun = false,
  }: {
    now?: Date;
    lookbackDays?: number;
    fetchList?: FetchDeliveryList;
    dryRun?: boolean;
  } = {},
): Promise<CjApiSyncResult> {
  const { startDate, endDate } = cjSyncDateRange(now, lookbackDays);

  // 한 호출이라도 실패하면 전체를 실패로 본다(일부만 넣고 성공처럼 보이면
  // 빠진 주문을 알아채기 어렵다). 넣는 것은 멱등이라 다음 실행에서 다시 채운다.
  let fetchedRows = 0;
  let invalidCount = 0;
  const rows = new Map<string, string | null>();
  const itemCodes = new Set(config.itemCodes);
  for (const itemCode of config.itemCodes) {
    for (const deliveryStatus of ["4", "5"] as const) {
      for (const deliveryMethodCode of config.deliveryMethodCodes) {
        const data = await fetchList(config, {
          dateType: "3",
          startDate,
          endDate,
          deliveryStatus,
          deliveryMethodCode,
          itemCode,
          orderType: "2",
        });
        fetchedRows += data.length;

        for (const raw of data) {
          // CJ 가 상품코드 조건을 무시하더라도 다른 상품이 섞이지 않게 한 번 더 거른다.
          if (raw.itemCode && !itemCodes.has(raw.itemCode.trim())) continue;
          const row = toCjManifestRow(raw);
          if (!row) {
            invalidCount += 1;
            continue;
          }
          if (
            !rows.has(row.orderNo) ||
            (rows.get(row.orderNo) === null && row.orderDate)
          ) {
            rows.set(row.orderNo, row.orderDate);
          }
        }
      }
    }
  }

  const base = {
    startDate,
    endDate,
    fetchedRows,
    uniqueOrderNos: rows.size,
    invalidCount,
  };
  if (dryRun) {
    return {
      ...base,
      insertedCount: 0,
      duplicateCount: 0,
      uploadId: null,
      sampleOrderNos: Array.from(rows.keys()).slice(0, 5),
    };
  }
  if (rows.size === 0) {
    return { ...base, insertedCount: 0, duplicateCount: 0, uploadId: null };
  }

  // 새로 들어갈 번호가 없으면 업로드 이력을 남기지 않는다(매시간 "0건" 행이
  // 쌓여 CJ 담당자 화면의 이력이 묻히지 않게).
  const orderNos = Array.from(rows.keys());
  const existing = await prisma.cjOrderManifest.findMany({
    where: { orderNo: { in: orderNos } },
    select: { orderNo: true },
  });
  const existingSet = new Set(existing.map((row) => row.orderNo));
  const fresh = orderNos.filter((orderNo) => !existingSet.has(orderNo));
  if (fresh.length === 0) {
    return {
      ...base,
      insertedCount: 0,
      duplicateCount: orderNos.length,
      uploadId: null,
    };
  }

  const upload = await prisma.cjManifestUpload.create({
    data: {
      fileName: `CJ API 출고일 ${startDate} ~ ${endDate}`,
      totalRows: fetchedRows,
      invalidCount,
      uploadedBy: CJ_API_SYNC_UPLOADED_BY,
    },
    select: { id: true },
  });

  const created = await prisma.cjOrderManifest.createMany({
    data: fresh.map((orderNo) => ({
      orderNo,
      orderDate: rows.get(orderNo) ?? null,
      uploadBatchId: upload.id,
    })),
    skipDuplicates: true,
  });

  const insertedCount = created.count;
  const duplicateCount = orderNos.length - insertedCount;
  await prisma.cjManifestUpload.update({
    where: { id: upload.id },
    data: { insertedCount, duplicateCount },
  });

  return { ...base, insertedCount, duplicateCount, uploadId: upload.id };
}
