import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDispatchRows } from "@/lib/dispatch";
import { saveFetchedInstallationOrderSources } from "@/lib/installation/orders/source/persistence";
import { syncInstallationOrdersFromErp } from "@/lib/installation/orders/source/sync";

vi.mock("@/lib/dispatch", () => ({
  fetchDispatchRows: vi.fn(),
}));

vi.mock("@/lib/installation/orders/source/persistence", () => ({
  saveFetchedInstallationOrderSources: vi.fn(),
}));

const fetchDispatchRowsMock = vi.mocked(fetchDispatchRows);
const saveFetchedInstallationOrderSourcesMock = vi.mocked(saveFetchedInstallationOrderSources);

describe("syncInstallationOrdersFromErp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T03:00:00.000Z"));
    fetchDispatchRowsMock.mockReset();
    saveFetchedInstallationOrderSourcesMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores dispatch ERP rows as source records for today in KST", async () => {
    fetchDispatchRowsMock.mockResolvedValue([
      {
        customer_name: "강성욱",
        phone: "010-5214-0131",
        address: "서울특별시 강서구 방화대로34길 113 101동 1308호",
        due_date: "20260623",
        order_numbers: "2026062274081761",
        no_girl: "ISU20260602618",
        memo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1",
      },
    ]);
    saveFetchedInstallationOrderSourcesMock.mockResolvedValue({ count: 1 });

    await expect(syncInstallationOrdersFromErp()).resolves.toEqual({
      fetchedCount: 1,
      savedCount: 1,
    });
    expect(fetchDispatchRowsMock).toHaveBeenCalledWith("20260623", "20260623");
    expect(saveFetchedInstallationOrderSourcesMock).toHaveBeenCalledWith([
      {
        source_key: "ISU20260602618",
        customer_name: "강성욱",
        phone: "010-5214-0131",
        address: "서울특별시 강서구 방화대로34길 113 101동 1308호",
        due_date: "20260623",
        order_numbers: "2026062274081761",
        no_girl: "ISU20260602618",
        memo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1",
      },
    ]);
  });
});
