import { prisma } from "@/lib/prisma";
import {
  isValidCjOrderNoFormat,
  normalizeCjOrderNo,
  parseCjManifestText,
} from "@/lib/installation/cj/manifest-parse";

export {
  isValidCjOrderNoFormat,
  normalizeCjOrderNo,
  parseCjManifestText,
} from "@/lib/installation/cj/manifest-parse";
export type { ParsedManifestRows } from "@/lib/installation/cj/manifest-parse";

// CJ 가 올리는 주문번호 명단. 고객이 입력한 주문번호가 여기 있어야 제출할 수
// 있고, 한 주문번호는 한 번만 쓸 수 있다.
//
// 명단이 아직 올라오지 않은 주문번호는 그냥 거절한다(폴백 없음). 업로드는
// CJ 책임이라는 것이 합의 사항이다.

export class CjManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CjManifestError";
  }
}

export type CjManifestLookup =
  | { status: "OK"; manifestId: string; orderNo: string; orderDate: string | null }
  | { status: "NOT_FOUND" }
  | { status: "ALREADY_USED" };

export async function lookupCjOrderNo(rawOrderNo: string): Promise<CjManifestLookup> {
  const orderNo = normalizeCjOrderNo(rawOrderNo);
  if (!orderNo || !isValidCjOrderNoFormat(orderNo)) {
    return { status: "NOT_FOUND" };
  }

  const manifest = await prisma.cjOrderManifest.findUnique({
    where: { orderNo },
    select: { id: true, orderNo: true, orderDate: true, consumedAt: true },
  });

  if (!manifest) return { status: "NOT_FOUND" };
  if (manifest.consumedAt) return { status: "ALREADY_USED" };

  return {
    status: "OK",
    manifestId: manifest.id,
    orderNo: manifest.orderNo,
    orderDate: manifest.orderDate,
  };
}

export type CjManifestUploadResult = {
  uploadId: string;
  totalRows: number;
  insertedCount: number;
  duplicateCount: number;
  invalidCount: number;
};

export async function saveCjManifestUpload({
  fileName,
  text,
  uploadedBy,
}: {
  fileName: string;
  text: string;
  uploadedBy: string | null;
}): Promise<CjManifestUploadResult> {
  const parsed = parseCjManifestText(text);
  if (parsed.totalRows === 0) {
    throw new CjManifestError("EMPTY_FILE");
  }

  const upload = await prisma.cjManifestUpload.create({
    data: {
      fileName,
      totalRows: parsed.totalRows,
      invalidCount: parsed.invalidCount,
      uploadedBy,
    },
    select: { id: true },
  });

  // 이미 올라온 주문번호는 건너뛴다(같은 파일을 두 번 올려도 안전하게).
  // 특히 이미 제출에 쓰인 번호를 되살리면 안 되므로 skipDuplicates 로 둔다.
  const created = await prisma.cjOrderManifest.createMany({
    data: parsed.rows.map((row) => ({
      orderNo: row.orderNo,
      orderDate: row.orderDate,
      uploadBatchId: upload.id,
    })),
    skipDuplicates: true,
  });

  const insertedCount = created.count;
  const duplicateCount = parsed.rows.length - insertedCount;

  await prisma.cjManifestUpload.update({
    where: { id: upload.id },
    data: { insertedCount, duplicateCount },
  });

  return {
    uploadId: upload.id,
    totalRows: parsed.totalRows,
    insertedCount,
    duplicateCount,
    invalidCount: parsed.invalidCount,
  };
}

export async function listRecentCjManifestUploads(limit = 20) {
  return prisma.cjManifestUpload.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      totalRows: true,
      insertedCount: true,
      duplicateCount: true,
      invalidCount: true,
      uploadedBy: true,
      createdAt: true,
    },
  });
}

export async function getCjManifestStats() {
  const [total, consumed] = await Promise.all([
    prisma.cjOrderManifest.count(),
    prisma.cjOrderManifest.count({ where: { consumedAt: { not: null } } }),
  ]);

  return { total, consumed, pending: total - consumed };
}
