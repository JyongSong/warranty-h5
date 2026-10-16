import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findUnique = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { cjOrderManifest: { findMany, findUnique, deleteMany } },
}));

const { searchCjManifestEntries, deleteCjManifestEntry, lookupCjOrderNo } = await import(
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

describe("lookupCjOrderNo", () => {
  function row(orderNo: string, consumedAt: Date | null = null, orderDate: string | null = "2026-10-15") {
    return { id: `id-${orderNo}`, orderNo, orderDate, consumedAt };
  }

  it("고객이 넣은 14자리로 명단의 시스템 번호를 찾는다", async () => {
    findMany.mockResolvedValue([row("20261015098508002001001")]);

    await expect(lookupCjOrderNo("20261015098508")).resolves.toEqual({
      status: "OK",
      manifestId: "id-20261015098508002001001",
      manifestIds: ["id-20261015098508002001001"],
      orderNo: "20261015098508002001001",
      orderDate: "2026-10-15",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderNo: { startsWith: "20261015098508" } } }),
    );
  });

  it("같은 주문의 여러 행을 함께 돌려준다", async () => {
    findMany.mockResolvedValue([row("20261015098508001001001"), row("20261015098508002001001")]);

    const result = await lookupCjOrderNo("2026-1015-098508");

    expect(result).toMatchObject({
      status: "OK",
      manifestIds: ["id-20261015098508001001001", "id-20261015098508002001001"],
      orderNo: "20261015098508001001001",
    });
  });

  it("같은 주문의 한 행이라도 쓰였으면 접수 완료다", async () => {
    findMany.mockResolvedValue([row("20261015098508001001001"), row("20261015098508002001001", new Date())]);

    await expect(lookupCjOrderNo("20261015098508")).resolves.toEqual({ status: "ALREADY_USED" });
  });

  it("시스템 번호 전체를 넣으면 그 행을 대표로 삼는다", async () => {
    findMany.mockResolvedValue([row("20261015098508001001001"), row("20261015098508002001001")]);

    await expect(lookupCjOrderNo("20261015098508002001001")).resolves.toMatchObject({
      status: "OK",
      orderNo: "20261015098508002001001",
      manifestIds: ["id-20261015098508001001001", "id-20261015098508002001001"],
    });
  });

  it("시스템 번호 뒷자리가 틀리면 찾지 못한다", async () => {
    findMany.mockResolvedValue([row("20261015098508001001001")]);

    await expect(lookupCjOrderNo("20261015098508009")).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("명단에 없으면 찾지 못한다", async () => {
    findMany.mockResolvedValue([]);

    await expect(lookupCjOrderNo("20261015098508")).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("14자리보다 짧으면 앞자리 일치 없이 정확히 일치할 때만 받는다", async () => {
    findUnique.mockResolvedValue(null);

    await expect(lookupCjOrderNo("2026101509")).resolves.toEqual({ status: "NOT_FOUND" });
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { orderNo: "2026101509" } }));
  });
});
