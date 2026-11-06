import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseItemCodes, toCjManifestRow } from "@/lib/installation/cj/cj-api";
import { saveCjOrderPush } from "@/lib/installation/cj/cj-order-push";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cjOrderManifest: { findMany: vi.fn(), createMany: vi.fn() },
    cjManifestUpload: { create: vi.fn(), update: vi.fn() },
  },
}));

const K100 = "2093860797";
const row = (orderNo: string, itemCode = K100, seq = "001") => ({
  orderNo,
  orderItemSequence: seq,
  orderDetailSequence: "001",
  orderProcessingSequence: "001",
  paymentDate: "2026-11-01 10:00:00",
  itemCode,
});

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
    expect(toCjManifestRow({ ...row("123") })).toBeNull();
    expect(toCjManifestRow({ ...row("20261015098508"), orderItemSequence: null })).toBeNull();
  });

  it("결제일이 없으면 orderDate 는 null", () => {
    expect(toCjManifestRow({ ...row("20261015098508"), paymentDate: null })?.orderDate).toBeNull();
  });
});

describe("parseItemCodes", () => {
  it("목록 / 기본값", () => {
    expect(parseItemCodes("2093860797, 2084581379, x")).toEqual(["2093860797", "2084581379"]);
    expect(parseItemCodes(undefined)).toEqual([K100]);
  });
});

describe("saveCjOrderPush", () => {
  beforeEach(() => {
    vi.mocked(prisma.cjOrderManifest.findMany).mockReset();
    vi.mocked(prisma.cjOrderManifest.createMany).mockReset();
    vi.mocked(prisma.cjManifestUpload.create).mockReset();
    vi.mocked(prisma.cjManifestUpload.update).mockReset();
  });

  it("허용 상품만, 새 번호만 넣는다", async () => {
    vi.mocked(prisma.cjOrderManifest.findMany).mockResolvedValue([{ orderNo: "20261101000001001001001" }] as never);
    vi.mocked(prisma.cjManifestUpload.create).mockResolvedValue({ id: "up1" } as never);
    vi.mocked(prisma.cjOrderManifest.createMany).mockResolvedValue({ count: 1 });

    const result = await saveCjOrderPush({
      rows: [
        row("20261101000001"),
        row("20261101000001"),
        row("20261101000002"),
        row("20261101000003", "2065659982"),
        { ...row("20261101000004"), itemCode: null },
        row("bad"),
      ],
      itemCodes: [K100],
      label: "CJ API 출고일 2026-10-30 ~ 2026-11-05",
    });

    expect(prisma.cjOrderManifest.createMany).toHaveBeenCalledWith({
      data: [{ orderNo: "20261101000002001001001", orderDate: "2026-11-01", uploadBatchId: "up1" }],
      skipDuplicates: true,
    });
    expect(prisma.cjManifestUpload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fileName: "CJ API 출고일 2026-10-30 ~ 2026-11-05", uploadedBy: "CJ API 자동" }),
      }),
    );
    expect(result).toMatchObject({
      receivedRows: 6,
      uniqueOrderNos: 2,
      insertedCount: 1,
      duplicateCount: 1,
      invalidCount: 1,
      skippedOtherItems: 2,
      uploadId: "up1",
    });
  });

  it("새 번호가 없으면 이력도 남기지 않는다", async () => {
    vi.mocked(prisma.cjOrderManifest.findMany).mockResolvedValue([{ orderNo: "20261101000001001001001" }] as never);
    const result = await saveCjOrderPush({ rows: [row("20261101000001")], itemCodes: [K100], label: "x" });
    expect(prisma.cjManifestUpload.create).not.toHaveBeenCalled();
    expect(result.uploadId).toBeNull();
  });

  it("넣을 것이 없으면 DB 를 조회하지도 않는다", async () => {
    const result = await saveCjOrderPush({ rows: [], itemCodes: [K100], label: "x" });
    expect(prisma.cjOrderManifest.findMany).not.toHaveBeenCalled();
    expect(result.insertedCount).toBe(0);
  });
});
