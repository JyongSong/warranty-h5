import { describe, expect, it } from "vitest";
import { buildGeocodeQueries, formatDistanceKm, getStraightDistanceMeters } from "@/lib/installation/distance/geo";

describe("installation distance geo helpers", () => {
  it("measures straight distance between Seoul City Hall and Daegu", () => {
    const meters = getStraightDistanceMeters(
      { latitude: 37.5663, longitude: 126.9779 },
      { latitude: 35.8714, longitude: 128.6014 },
    );

    expect(meters).toBeGreaterThan(230_000);
    expect(meters).toBeLessThan(245_000);
  });

  it("formats meters as kilometers with one decimal", () => {
    expect(formatDistanceKm(12_340)).toBe("12.3km");
  });

  it("falls back to the road address without unit details", () => {
    expect(buildGeocodeQueries("서울 강남구 봉은사로 10 101동 1203호 공동현관 #1234")).toEqual([
      "서울 강남구 봉은사로 10 101동 1203호 공동현관 #1234",
      "서울 강남구 봉은사로 10",
    ]);
  });

  it("keeps the numbered 길 of a road with a digit in its name", () => {
    expect(buildGeocodeQueries("서울특별시 노원구 노원로22길 34 (상계동) 2층")).toEqual([
      "서울특별시 노원구 노원로22길 34 2층",
      "서울특별시 노원구 노원로22길 34",
    ]);
  });

  it("falls back to the lot number when there is no road address", () => {
    expect(buildGeocodeQueries("경북 경산시 사동 123-4 2층")).toEqual([
      "경북 경산시 사동 123-4 2층",
      "경북 경산시 사동 123-4",
    ]);
  });

  it("returns no query for a blank address", () => {
    expect(buildGeocodeQueries("  ")).toEqual([]);
  });
});
