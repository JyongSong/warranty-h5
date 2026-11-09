import { describe, expect, it, vi } from "vitest";
import { rankInstallersByDistance } from "@/lib/installation/installer/distance-ranking";
import type { InstallationOrderInstaller } from "@/lib/installation/installer/matcher";

vi.mock("@/lib/installation/distance/service", () => ({ getInstallerDistances: vi.fn() }));

const ADDRESS = "서울 강남구 테헤란로 1";

function installer(
  id: string,
  overrides: Partial<InstallationOrderInstaller> = {},
): InstallationOrderInstaller {
  return {
    businessNumber: id,
    branchName: id,
    phone: "010-0000-0000",
    installationRegion: "서울",
    possibleRegion: "서울 강남구",
    impossibleRegion: "",
    monthlyDispatchCount: 0,
    lastRequestedAt: null,
    ...overrides,
  };
}

function lookupWith(rows: Array<{ id: string; straight: number; driving?: number | null }>) {
  return vi.fn().mockResolvedValue({
    status: "OK",
    customer: { latitude: 37.5, longitude: 127.03 },
    eligible: rows.map((row) => ({
      installerId: row.id,
      installerName: row.id,
      installerBranch: null,
      straightMeters: row.straight,
      drivingMeters: row.driving ?? null,
    })),
    included: [],
  });
}

describe("rankInstallersByDistance", () => {
  it("keeps only region-eligible installers within 20km (driving distance first, straight as fallback)", async () => {
    const installers = [
      installer("near"),
      installer("far-driving"),
      installer("no-coords"),
      installer("straight-only"),
      installer("other-region", { installationRegion: "부산", possibleRegion: "부산 해운대구" }),
    ];
    const lookup = lookupWith([
      { id: "near", straight: 3000, driving: 4500 },
      // 직선은 가깝지만 경로가 20km 를 넘는다.
      { id: "far-driving", straight: 15000, driving: 26000 },
      { id: "straight-only", straight: 12000, driving: null },
    ]);

    const result = await rankInstallersByDistance(ADDRESS, installers, lookup);

    expect(lookup).toHaveBeenCalledWith({
      address: ADDRESS,
      eligibleInstallerIds: ["near", "far-driving", "no-coords", "straight-only"],
    });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.candidates.map((c) => [c.businessNumber, c.distanceMeters, c.distanceSource])).toEqual([
      ["near", 4500, "DRIVING"],
      ["straight-only", 12000, "STRAIGHT"],
    ]);
    // 20km 밖(far-driving) + 좌표 없음(no-coords)
    expect(result.excludedCount).toBe(2);
  });

  it("orders by 10km band, then district match, then monthly load, then distance", async () => {
    const installers = [
      installer("busy-close", { monthlyDispatchCount: 9 }),
      installer("idle-close", { monthlyDispatchCount: 1 }),
      installer("region-only-close", { possibleRegion: "", monthlyDispatchCount: 0 }),
      installer("idle-far", { monthlyDispatchCount: 0 }),
    ];
    const lookup = lookupWith([
      { id: "busy-close", straight: 1000, driving: 2000 },
      { id: "idle-close", straight: 5000, driving: 8000 },
      { id: "region-only-close", straight: 1000, driving: 1500 },
      { id: "idle-far", straight: 11000, driving: 14000 },
    ]);

    const result = await rankInstallersByDistance(ADDRESS, installers, lookup);
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.candidates.map((c) => c.businessNumber)).toEqual([
      // 0~10km: 시·군·구 일치 먼저, 그 안에서 이번 달 적게 받은 사람
      "idle-close",
      "busy-close",
      "region-only-close",
      // 10~20km
      "idle-far",
    ]);
  });

  it("returns UNAVAILABLE when the customer address cannot be located or the map API fails", async () => {
    const notFound = vi.fn().mockResolvedValue({ status: "ADDRESS_NOT_FOUND" });
    expect(await rankInstallersByDistance(ADDRESS, [installer("a")], notFound)).toEqual({
      status: "UNAVAILABLE",
      reason: "ADDRESS_NOT_FOUND",
    });

    const failing = vi.fn().mockRejectedValue(new Error("NAVER_MAPS_DOWN"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await rankInstallersByDistance(ADDRESS, [installer("a")], failing)).toEqual({
      status: "UNAVAILABLE",
      reason: "NAVER_MAPS_DOWN",
    });
  });

  it("does not call the map API when nobody covers the region", async () => {
    const lookup = vi.fn();
    const result = await rankInstallersByDistance(
      ADDRESS,
      [installer("busan", { installationRegion: "부산", possibleRegion: "부산 해운대구" })],
      lookup,
    );
    expect(result).toEqual({ status: "OK", candidates: [], excludedCount: 0 });
    expect(lookup).not.toHaveBeenCalled();
  });
});
