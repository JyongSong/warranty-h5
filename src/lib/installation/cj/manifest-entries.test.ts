import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findUnique = vi.fn();
const deleteMany = vi.fn();
const count = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { cjOrderManifest: { findMany, findUnique, deleteMany, count } },
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
  count.mockReset();
  count.mockResolvedValue(0);
});

describe("searchCjManifestEntries", () => {
  it("검색어가 없으면 최근 20건을 보여 준다", async () => {
    const rows = [entry("20260620034905")];
    findMany.mockResolvedValue(rows);
    count.mockResolvedValue(1);

    const result = await searchCjManifestEntries("  ");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined, take: 21 }));
    expect(result).toEqual({ entries: rows, truncated: false, total: 1 });
  });

  it("검색어를 정규화해 포함 검색한다", async () => {
    findMany.mockResolvedValue([]);

    await searchCjManifestEntries(" 0620-0349 ");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ orderNo: { contains: "06200349" } }] }, take: 51 }),
    );
  });

  it("한도를 넘으면 잘라 내고 truncated 를 켠다", async () => {
    findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => entry(`2026062000${String(i).padStart(4, "0")}`)));

    const result = await searchCjManifestEntries("2026");

    expect(result.entries).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("미접수 + 주문일 범위로 거르고 주문일 순으로 보여 준다", async () => {
    findMany.mockResolvedValue([]);

    await searchCjManifestEntries({
      dateField: "orderDate",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-20",
      status: "PENDING",
    });

    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      AND: [
        { consumedAt: null },
        { orderDate: { not: null, gte: "2026-11-01", lte: "2026-11-20" } },
      ],
    });
    expect(args.orderBy[0]).toEqual({ orderDate: { sort: "desc", nulls: "last" } });
    expect(args.take).toBe(301);
  });

  it("접수일 범위는 한국 시간 하루 경계로 자른다", async () => {
    findMany.mockResolvedValue([]);

    await searchCjManifestEntries({ dateField: "consumedAt", dateFrom: "2026-11-21", dateTo: "2026-11-21", status: "CONSUMED" });

    expect(findMany.mock.calls[0][0].where).toEqual({
      AND: [
        { consumedAt: { not: null } },
        {
          consumedAt: {
            gte: new Date("2026-11-20T15:00:00.000Z"),
            lt: new Date("2026-11-21T15:00:00.000Z"),
          },
        },
      ],
    });
  });

  it("시작일이 종료일보다 늦으면 바꿔서 쓰고, 형식이 틀린 날짜는 무시한다", async () => {
    findMany.mockResolvedValue([]);

    await searchCjManifestEntries({ dateField: "createdAt", dateFrom: "2026-11-20", dateTo: "2026-11-01" });
    expect(findMany.mock.calls[0][0].where.AND[0].createdAt.gte).toEqual(new Date("2026-10-31T15:00:00.000Z"));

    findMany.mockClear();
    await searchCjManifestEntries({ dateField: "createdAt", dateFrom: "2026/11/20" });
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
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
