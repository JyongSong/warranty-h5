import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDispatchRowsByOrderNumber, type DispatchLookupRow } from "@/lib/dispatch";
import { saveFetchedInstallationOrderSources } from "@/lib/installation/orders/source/persistence";
import {
  addErpOrderToInstallationQueue,
  lookupErpOrdersByNumber,
} from "@/lib/installation/orders/source/manual-add";

const { sourceFindMany, sourceFindUnique } = vi.hoisted(() => ({
  sourceFindMany: vi.fn(),
  sourceFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrderSource: {
      findMany: sourceFindMany,
      findUnique: sourceFindUnique,
    },
  },
}));

vi.mock("@/lib/dispatch", () => ({
  fetchDispatchRowsByOrderNumber: vi.fn(),
}));

vi.mock("@/lib/installation/orders/source/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/installation/orders/source/persistence")>()),
  saveFetchedInstallationOrderSources: vi.fn(),
}));

const fetchByNumberMock = vi.mocked(fetchDispatchRowsByOrderNumber);
const saveMock = vi.mocked(saveFetchedInstallationOrderSources);

const row: DispatchLookupRow = {
  customer_name: "홍길동",
  phone: "010-1234-5678",
  address: "서울 강남구 테헤란로 1",
  order_numbers: "20261026-0000097",
  no_girl: "ISU20261001622",
  due_date: "20261030",
  memo: "K100 x1",
  fully_shipped: false,
  has_service_item: true,
};

describe("ERP order manual queue add", () => {
  beforeEach(() => {
    fetchByNumberMock.mockReset();
    saveMock.mockReset();
    sourceFindMany.mockReset();
    sourceFindUnique.mockReset();
    fetchByNumberMock.mockResolvedValue([row]);
    sourceFindMany.mockResolvedValue([]);
  });

  it("looks up by trimmed number and marks orders not in the queue yet", async () => {
    const items = await lookupErpOrdersByNumber("  ISU20261001622 ");

    expect(fetchByNumberMock).toHaveBeenCalledWith("ISU20261001622");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source_key: "ISU20261001622",
      fully_shipped: false,
      has_service_item: true,
      existing_orders: [],
    });
  });

  it("finds existing queue orders by overlapping 출고번호 or 주문번호", async () => {
    sourceFindMany.mockResolvedValue([{ order: { id: "order-1", status: "CANCELLED" } }]);

    const items = await lookupErpOrdersByNumber("20261026-0000097");

    expect(items[0].existing_orders).toEqual([{ installationOrderId: "order-1", status: "CANCELLED" }]);
    expect(sourceFindMany.mock.calls[0][0].where).toEqual({
      channel: "SELF",
      OR: [
        { sourceKey: "ISU20261001622" },
        { noGirl: { contains: "ISU20261001622" } },
        { orderNumbers: { contains: "20261026-0000097" } },
      ],
    });
  });

  it("rejects an empty number without querying ERP", async () => {
    await expect(lookupErpOrdersByNumber("   ")).rejects.toThrow("ORDER_NUMBER_REQUIRED");
    expect(fetchByNumberMock).not.toHaveBeenCalled();
  });

  it("re-reads ERP and saves the order through the sync path", async () => {
    sourceFindUnique.mockResolvedValue({ order: { id: "order-new" } });

    const result = await addErpOrderToInstallationQueue({
      query: "ISU20261001622",
      sourceKey: "ISU20261001622",
    });

    expect(result).toEqual({ installationOrderId: "order-new" });
    expect(saveMock).toHaveBeenCalledWith([expect.objectContaining({ source_key: "ISU20261001622" })]);
  });

  it("refuses to add an order already in the queue", async () => {
    sourceFindMany.mockResolvedValue([{ order: { id: "order-1", status: "WAITING_CUSTOMER_INPUT" } }]);

    await expect(
      addErpOrderToInstallationQueue({ query: "ISU20261001622", sourceKey: "ISU20261001622" }),
    ).rejects.toThrow("ALREADY_IN_QUEUE");
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("refuses a source key the ERP lookup no longer returns", async () => {
    await expect(
      addErpOrderToInstallationQueue({ query: "ISU20261001622", sourceKey: "OTHER" }),
    ).rejects.toThrow("ERP_ORDER_NOT_FOUND");
    expect(saveMock).not.toHaveBeenCalled();
  });
});
