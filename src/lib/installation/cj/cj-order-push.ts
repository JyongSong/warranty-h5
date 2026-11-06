import { prisma } from "@/lib/prisma";
import { toCjManifestRow, type CjDeliveryRow } from "@/lib/installation/cj/cj-api";

// 회사 PC(scripts/cj-order-push.mjs)가 CJ API 로 조회한 출고 주문을 받아
// cj_order_manifests 에 넣는다. 수동 업로드와 같은 테이블·같은 규칙
// (skipDuplicates: 이미 있는 번호, 특히 이미 제출에 쓰인 번호는 건드리지 않음)이라
// 고객 입력 쪽은 바꿀 것이 없다. 수동 업로드도 그대로 쓸 수 있다.

export const CJ_ORDER_PUSH_UPLOADED_BY = "CJ API 자동";
export const CJ_ORDER_PUSH_MAX_ROWS = 5000;

export type CjOrderPushResult = {
  receivedRows: number;
  uniqueOrderNos: number;
  insertedCount: number;
  duplicateCount: number;
  invalidCount: number;
  skippedOtherItems: number;
  uploadId: string | null;
};

export async function saveCjOrderPush({
  rows,
  itemCodes,
  label,
}: {
  rows: CjDeliveryRow[];
  itemCodes: string[];
  // 업로드 이력에 남는 이름(예: 출고일 범위)
  label: string;
}): Promise<CjOrderPushResult> {
  const allowed = new Set(itemCodes);
  const manifest = new Map<string, string | null>();
  let invalidCount = 0;
  let skippedOtherItems = 0;

  for (const raw of rows) {
    // 상품코드가 없거나 다른 상품이면 넣지 않는다.
    if (!raw.itemCode || !allowed.has(raw.itemCode.trim())) {
      skippedOtherItems += 1;
      continue;
    }
    const row = toCjManifestRow(raw);
    if (!row) {
      invalidCount += 1;
      continue;
    }
    if (!manifest.has(row.orderNo) || (manifest.get(row.orderNo) === null && row.orderDate)) {
      manifest.set(row.orderNo, row.orderDate);
    }
  }

  const base = {
    receivedRows: rows.length,
    uniqueOrderNos: manifest.size,
    invalidCount,
    skippedOtherItems,
  };
  if (manifest.size === 0) {
    return { ...base, insertedCount: 0, duplicateCount: 0, uploadId: null };
  }

  // 새로 들어갈 번호가 없으면 업로드 이력을 남기지 않는다(매시간 "0건" 행이
  // 쌓여 CJ 담당자 화면의 이력이 묻히지 않게).
  const orderNos = Array.from(manifest.keys());
  const existing = await prisma.cjOrderManifest.findMany({
    where: { orderNo: { in: orderNos } },
    select: { orderNo: true },
  });
  const existingSet = new Set(existing.map((row) => row.orderNo));
  const fresh = orderNos.filter((orderNo) => !existingSet.has(orderNo));
  if (fresh.length === 0) {
    return { ...base, insertedCount: 0, duplicateCount: orderNos.length, uploadId: null };
  }

  const upload = await prisma.cjManifestUpload.create({
    data: {
      fileName: label,
      totalRows: rows.length,
      invalidCount,
      uploadedBy: CJ_ORDER_PUSH_UPLOADED_BY,
    },
    select: { id: true },
  });

  const created = await prisma.cjOrderManifest.createMany({
    data: fresh.map((orderNo) => ({
      orderNo,
      orderDate: manifest.get(orderNo) ?? null,
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
