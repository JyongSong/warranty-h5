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

export type CjManifestEntry = {
  id: string;
  orderNo: string;
  orderDate: string | null;
  createdAt: Date;
  consumedAt: Date | null;
};

const SEARCH_LIMIT = 50;
const RECENT_LIMIT = 20;

// 파트너 화면의 주문번호 조회. 검색어가 비어 있으면 최근 등록분을 보여 주고,
// 있으면 일부만 쳐도 찾을 수 있게 포함 검색을 한다. 고객 입력과 같은 규칙으로
// 정규화하므로 하이픈·공백을 섞어 쳐도 된다.
export async function searchCjManifestEntries(
  rawQuery: string,
): Promise<{ entries: CjManifestEntry[]; truncated: boolean }> {
  const query = normalizeCjOrderNo(rawQuery);
  const limit = query ? SEARCH_LIMIT : RECENT_LIMIT;

  const rows = await prisma.cjOrderManifest.findMany({
    where: query ? { orderNo: { contains: query } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: { id: true, orderNo: true, orderDate: true, createdAt: true, consumedAt: true },
  });

  return { entries: rows.slice(0, limit), truncated: rows.length > limit };
}

export type CjManifestDeleteResult = "DELETED" | "NOT_FOUND" | "ALREADY_USED";

// 잘못 올린 주문번호를 지운다. 고객이 이미 제출한 번호는 설치 건과 이어져 있어
// 지우지 않는다(지우면 같은 번호로 다시 올려 두 번째 제출이 가능해진다).
// 조회와 삭제 사이에 고객이 제출하는 경우를 막으려고 consumedAt 조건을 삭제
// 쿼리 자체에 건다.
export async function deleteCjManifestEntry(id: string): Promise<CjManifestDeleteResult> {
  const deleted = await prisma.cjOrderManifest.deleteMany({
    where: { id, consumedAt: null },
  });
  if (deleted.count > 0) return "DELETED";

  const existing = await prisma.cjOrderManifest.findUnique({
    where: { id },
    select: { id: true },
  });
  return existing ? "ALREADY_USED" : "NOT_FOUND";
}
