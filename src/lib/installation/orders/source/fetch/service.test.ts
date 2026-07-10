import { describe, expect, it, vi } from "vitest";
import { fetchErpInstallationOrderRows } from "@/lib/installation/orders/source/fetch/query";
import {
  fetchRawInstallationOrderRowsFromErp,
  mapErpRowsToFetchedInstallationOrders,
} from "@/lib/installation/orders/source/fetch/service";

vi.mock("@/lib/installation/orders/source/fetch/query", () => ({
  fetchErpInstallationOrderRows: vi.fn(),
}));

describe("mapErpRowsToFetchedInstallationOrders", () => {
  it("maps dispatch query rows to fetched installation source orders", () => {
    const [order] = mapErpRowsToFetchedInstallationOrders([
      {
        customer_name: "강성욱",
        phone: "010-5214-0131",
        address: "서울특별시 강서구 방화대로34길 113",
        due_date: "20260623",
        order_numbers: "2026062274081761",
        no_girl: "ISU20260623001",
        memo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
      },
    ]);

    expect(order).toEqual({
      source_key: "ISU20260623001",
      customer_name: "강성욱",
      phone: "010-5214-0131",
      address: "서울특별시 강서구 방화대로34길 113",
      due_date: "20260623",
      order_numbers: "2026062274081761",
      no_girl: "ISU20260623001",
      memo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
    });
  });

  it("uses normalized order numbers as the source key when no_girl is missing", () => {
    const [order] = mapErpRowsToFetchedInstallationOrders([
      {
        customer_name: "강지훈",
        phone: "010-9918-7857",
        address: "전북 익산시 동서로",
        due_date: "20260623",
        order_numbers: "20260622-0000509, 2026062274081761",
        no_girl: null,
        memo: "스마트 도어락 L100 x1",
      },
    ]);

    expect(order.source_key).toBe("20260622-0000509,2026062274081761");
  });

  it("passes explicit due date range options to the raw ERP order fetch", async () => {
    vi.mocked(fetchErpInstallationOrderRows).mockResolvedValue([]);

    await fetchRawInstallationOrderRowsFromErp({
      from: "20260601",
      to: "20260623",
    });

    expect(fetchErpInstallationOrderRows).toHaveBeenCalledWith("20260601", "20260623");
  });
});
