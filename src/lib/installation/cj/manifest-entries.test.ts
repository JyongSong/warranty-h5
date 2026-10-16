import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findUnique = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { cjOrderManifest: { findMany, findUnique, deleteMany } },
}));

const { searchCjManifestEntries, deleteCjManifestEntry } = await import(
  "@/lib/installation/cj/manifest"
);

function entry(orderNo: string) {
  return { id: `id-${orderNo}`, orderNo, orderDate: null, createdAt: new Date(), consumedAt: null };
}

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
  deleteMany.mockReset();
});

describe("searchCjManifestEntries", () => {
  it("검색어가 없으면 최근 20건을 보여 준다", async () => {
    const rows = [entry("20260620034905")];
    findMany.mockResolvedValue(rows);

    const result = await searchCjManifestEntries("  ");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined, take: 21 }));
    expect(result).toEqual({ entries: rows, truncated: false });
  });

  it("검색어를 정규화해 포함 검색한다", async () => {
    findMany.mockResolvedValue([]);

    await searchCjManifestEntries(" 0620-0349 ");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderNo: { contains: "06200349" } }, take: 51 }),
    );
  });

  it("한도를 넘으면 잘라 내고 truncated 를 켠다", async () => {
    findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => entry(`2026062000${String(i).padStart(4, "0")}`)));

    const result = await searchCjManifestEntries("2026");

    expect(result.entries).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });
});

describe("deleteCjManifestEntry", () => {
  it("미접수 번호만 지우도록 consumedAt 조건을 건다", async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteCjManifestEntry("m1")).resolves.toBe("DELETED");
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "m1", consumedAt: null } });
  });

  it("이미 접수된 번호는 지우지 않는다", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ id: "m1" });

    await expect(deleteCjManifestEntry("m1")).resolves.toBe("ALREADY_USED");
  });

  it("없는 번호는 NOT_FOUND 다", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue(null);

    await expect(deleteCjManifestEntry("m1")).resolves.toBe("NOT_FOUND");
  });
});
