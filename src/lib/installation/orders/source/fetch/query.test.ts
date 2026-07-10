import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDispatchRows } from "@/lib/dispatch";

vi.mock("@/lib/dispatch", () => ({
  fetchDispatchRows: vi.fn(),
}));

const fetchDispatchRowsMock = vi.mocked(fetchDispatchRows);

describe("fetchErpInstallationOrderRows", () => {
  beforeEach(() => {
    fetchDispatchRowsMock.mockReset();
    fetchDispatchRowsMock.mockResolvedValue([]);
  });

  it("reuses dispatch ERP rows for the requested due date", async () => {
    const { fetchErpInstallationOrderRows } = await import("@/lib/installation/orders/source/fetch/query");

    await fetchErpInstallationOrderRows("20260623");

    expect(fetchDispatchRowsMock).toHaveBeenCalledWith("20260623", "20260623");
  });

  it("reuses dispatch ERP rows for the requested due date range", async () => {
    const { fetchErpInstallationOrderRows } = await import("@/lib/installation/orders/source/fetch/query");

    await fetchErpInstallationOrderRows("20260601", "20260623");

    expect(fetchDispatchRowsMock).toHaveBeenCalledWith("20260601", "20260623");
  });

  it("returns the dispatch rows unchanged", async () => {
    const rows = [
      {
        customer_name: "강성욱",
        phone: "010-5214-0131",
        address: "서울특별시 강서구 방화대로34길 113",
        due_date: "20260623",
        order_numbers: "2026062274081761",
        no_girl: "ISU20260623001",
        memo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
      },
    ];
    fetchDispatchRowsMock.mockResolvedValue(rows);
    const { fetchErpInstallationOrderRows } = await import("@/lib/installation/orders/source/fetch/query");

    await expect(fetchErpInstallationOrderRows("20260623")).resolves.toEqual(rows);
  });
});
