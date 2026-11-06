import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cjSyncDateRange,
  parseDeliveryMethodCodes,
  parseItemCodes,
  readCjApiConfig,
  toCjManifestRow,
  type CjApiConfig,
  type CjDeliveryQuery,
} from "@/lib/installation/cj/cj-api";
import { syncCjManifestFromApi } from "@/lib/installation/cj/cj-api-sync";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cjOrderManifest: { findMany: vi.fn(), createMany: vi.fn() },
    cjManifestUpload: { create: vi.fn(), update: vi.fn() },
  },
}));

describe("toCjManifestRow", () => {
  it("주문번호 14 + 순번 3×3 = 업로드 명단과 같은 23자리", () => {
    expect(
      toCjManifestRow({
        orderNo: "20261015098508",
        orderItemSequence: "002",
        orderDetailSequence: "1",
        orderProcessingSequence: "001",
        paymentDate: "2026-10-15 23:35:16",
      }),
    ).toEqual({ orderNo: "20261015098508002001001", orderDate: "2026-10-15" });
  });

  it("주문번호나 순번이 이상하면 버린다", () => {
    expect(toCjManifestRow({ orderNo: "123", orderItemSequence: "001", orderDetailSequence: "001", orderProcessingSequence: "001" })).toBeNull();
    expect(toCjManifestRow({ orderNo: "20261015098508", orderItemSequence: null, orderDetailSequence: "001", orderProcessingSequence: "001" })).toBeNull();
  });

  it("결제일이 없으면 orderDate 는 null", () => {
    expect(
      toCjManifestRow({ orderNo: "20261015098508", orderItemSequence: "001", orderDetailSequence: "001", orderProcessingSequence: "001" })?.orderDate,
    ).toBeNull();
  });
});

describe("config", () => {
  it("키가 없으면 null", () => {
    expect(readCjApiConfig({ CJ_API_VENDOR_CODE: "v" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("기본값: 운영 URL, 프록시 없음, 배송방법 미지정+10", () => {
    expect(readCjApiConfig({ CJ_API_VENDOR_CODE: "v", CJ_API_AUTH_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toEqual({
      baseUrl: "https://ingress-api.cjoshopping.com",
      vendorCode: "v",
      authenticationKey: "k",
      proxyUrl: null,
      deliveryMethodCodes: ["", "10"],
      itemCodes: ["2093860797"],
    });
  });

  it("상품코드 목록", () => {
    expect(parseItemCodes("2093860797, 2084581379, x")).toEqual(["2093860797", "2084581379"]);
    expect(parseItemCodes(undefined)).toEqual(["2093860797"]);
  });

  it("배송방법 목록: '-' 는 미지정, 잘못된 값은 무시", () => {
    expect(parseDeliveryMethodCodes("40, -, x")).toEqual(["40", ""]);
    expect(parseDeliveryMethodCodes("x")).toEqual(["", "10"]);
  });
});

describe("cjSyncDateRange", () => {
  it("KST 날짜로 오늘 포함 N일", () => {
    // 2026-11-05 16:00 UTC = 2026-11-06 01:00 KST
    expect(cjSyncDateRange(new Date("2026-11-05T16:00:00Z"), 7)).toEqual({
      startDate: "2026-10-31",
      endDate: "2026-11-06",
    });
  });

  it("최대 30일", () => {
    expect(cjSyncDateRange(new Date("2026-11-05T00:00:00Z"), 99).startDate).toBe("2026-10-07");
  });
});

describe("syncCjManifestFromApi", () => {
  const config: CjApiConfig = {
    baseUrl: "https://x",
    vendorCode: "v",
    authenticationKey: "k",
    proxyUrl: null,
    deliveryMethodCodes: ["", "10"],
    itemCodes: ["2093860797"],
  };
  const row = (orderNo: string, seq = "001", itemCode = "2093860797") => ({
    itemCode,
    orderNo,
    orderItemSequence: seq,
    orderDetailSequence: "001",
    orderProcessingSequence: "001",
    paymentDate: "2026-11-01 10:00:00",
    // 개인정보는 와도 쓰지 않는다
    ordererName: "홍길동",
  });

  beforeEach(() => {
    vi.mocked(prisma.cjOrderManifest.findMany).mockReset();
    vi.mocked(prisma.cjOrderManifest.createMany).mockReset();
    vi.mocked(prisma.cjManifestUpload.create).mockReset();
    vi.mocked(prisma.cjManifestUpload.update).mockReset();
  });

  it("출고·배송완료 × 배송방법 전부 조회하고 새 번호만 넣는다", async () => {
    const fetchList = vi.fn(async (_c: CjApiConfig, q: CjDeliveryQuery) => {
      if (q.deliveryStatus === "4" && q.deliveryMethodCode === "") return [row("20261101000001"), row("bad")];
      if (q.deliveryStatus === "5" && q.deliveryMethodCode === "10") return [row("20261101000001"), row("20261101000002")];
      return [];
    });
    vi.mocked(prisma.cjOrderManifest.findMany).mockResolvedValue([{ orderNo: "20261101000001001001001" }] as never);
    vi.mocked(prisma.cjManifestUpload.create).mockResolvedValue({ id: "up1" } as never);
    vi.mocked(prisma.cjOrderManifest.createMany).mockResolvedValue({ count: 1 });

    const result = await syncCjManifestFromApi(config, { now: new Date("2026-11-05T03:00:00Z"), fetchList });

    expect(fetchList).toHaveBeenCalledTimes(4);
    expect(
      fetchList.mock.calls.every(
        ([, q]) => q.dateType === "3" && q.orderType === "2" && q.itemCode === "2093860797",
      ),
    ).toBe(true);
    expect(prisma.cjOrderManifest.createMany).toHaveBeenCalledWith({
      data: [{ orderNo: "20261101000002001001001", orderDate: "2026-11-01", uploadBatchId: "up1" }],
      skipDuplicates: true,
    });
    expect(result).toMatchObject({ fetchedRows: 4, uniqueOrderNos: 2, insertedCount: 1, duplicateCount: 1, invalidCount: 1, uploadId: "up1" });
  });

  it("새 번호가 없으면 이력도 남기지 않는다", async () => {
    vi.mocked(prisma.cjOrderManifest.findMany).mockResolvedValue([{ orderNo: "20261101000001001001001" }] as never);
    const result = await syncCjManifestFromApi(config, { fetchList: async () => [row("20261101000001")] });
    expect(prisma.cjManifestUpload.create).not.toHaveBeenCalled();
    expect(result.uploadId).toBeNull();
  });

  it("dryRun 은 DB 를 건드리지 않는다", async () => {
    const result = await syncCjManifestFromApi(config, { dryRun: true, fetchList: async () => [row("20261101000003")] });
    expect(prisma.cjOrderManifest.findMany).not.toHaveBeenCalled();
    expect(result.sampleOrderNos).toEqual(["20261101000003001001001"]);
  });

  it("호출 하나가 실패하면 아무것도 쓰지 않고 실패", async () => {
    let n = 0;
    const fetchList = async () => {
      n += 1;
      if (n === 2) throw new Error("boom");
      return [row("20261101000004")];
    };
    await expect(syncCjManifestFromApi(config, { fetchList })).rejects.toThrow("boom");
    expect(prisma.cjOrderManifest.createMany).not.toHaveBeenCalled();
  });
});

describe("상품코드 필터", () => {
  it("다른 상품이 응답에 섞여 와도 넣지 않는다", async () => {
    const config: CjApiConfig = {
      baseUrl: "https://x",
      vendorCode: "v",
      authenticationKey: "k",
      proxyUrl: null,
      deliveryMethodCodes: [""],
      itemCodes: ["2093860797"],
    };
    const mk = (orderNo: string, itemCode: string) => ({
      orderNo,
      orderItemSequence: "001",
      orderDetailSequence: "001",
      orderProcessingSequence: "001",
      itemCode,
    });
    const result = await syncCjManifestFromApi(config, {
      dryRun: true,
      fetchList: async () => [mk("20261101000010", "2093860797"), mk("20261101000011", "2065659982")],
    });
    expect(result.sampleOrderNos).toEqual(["20261101000010001001001"]);
  });
});
