import { describe, expect, it } from "vitest";
import { findBestMatchingInstallers } from "@/lib/installation/installer/matcher";

const baseInstaller = {
  phone: "010-0000-0000",
  impossibleRegion: "",
};

describe("findBestMatchingInstallers", () => {
  it("prioritizes exact district matches over region-only matches", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      {
        ...baseInstaller,
        businessNumber: "region-only",
        branchName: "서울광역기사",
        installationRegion: "서울",
        possibleRegion: "",
      },
      {
        ...baseInstaller,
        businessNumber: "exact-district",
        branchName: "강남구기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
      },
    ]);

    expect(result.map((installer) => installer.businessNumber)).toEqual(["exact-district"]);
    expect(result[0].matchTier).toBe("EXACT_DISTRICT");
  });

  it("classifies a service area full key as an exact district match", () => {
    const result = findBestMatchingInstallers("경기 성남시 분당구 판교역로 1", [
      {
        ...baseInstaller,
        businessNumber: "installer-1",
        branchName: "분당기사",
        installationRegion: "경기",
        possibleRegion: "경기 성남시 분당구",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].businessNumber).toBe("installer-1");
    expect(result[0].matchTier).toBe("EXACT_DISTRICT");
  });

  it("classifies same region without a full key match as region only", () => {
    const result = findBestMatchingInstallers("경기 성남시 분당구 판교역로 1", [
      {
        ...baseInstaller,
        businessNumber: "installer-1",
        branchName: "경기광역기사",
        installationRegion: "경기",
        possibleRegion: "경기 수원시 영통구",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].businessNumber).toBe("installer-1");
    expect(result[0].matchTier).toBe("REGION_ONLY");
  });

  it("falls back to region only when service areas are empty", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      {
        ...baseInstaller,
        businessNumber: "installer-1",
        branchName: "서울기존기사",
        installationRegion: "서울",
        possibleRegion: "",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].businessNumber).toBe("installer-1");
    expect(result[0].matchTier).toBe("REGION_ONLY");
  });

  it("returns tier 1 candidates before tier 2 candidates regardless of input order", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      {
        ...baseInstaller,
        businessNumber: "region-only",
        branchName: "서울광역기사",
        installationRegion: "서울",
        possibleRegion: "",
      },
      {
        ...baseInstaller,
        businessNumber: "exact-district",
        branchName: "강남구기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
      },
    ]);

    expect(result[0].businessNumber).toBe("exact-district");
    expect(result[0].matchTier).toBe("EXACT_DISTRICT");
  });

  it("sorts candidates in the same tier by monthly dispatch count then installer id", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      {
        ...baseInstaller,
        businessNumber: "installer-c",
        branchName: "월배정많은기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        monthlyDispatchCount: 3,
      },
      {
        ...baseInstaller,
        businessNumber: "installer-b",
        branchName: "동률두번째기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        monthlyDispatchCount: 1,
      },
      {
        ...baseInstaller,
        businessNumber: "installer-a",
        branchName: "동률첫번째기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        monthlyDispatchCount: 1,
      },
    ]);

    expect(result.map((installer) => installer.businessNumber)).toEqual([
      "installer-a",
      "installer-b",
      "installer-c",
    ]);
  });

  it("sorts candidates in the same tier and count by oldest recent request time before installer id", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      {
        ...baseInstaller,
        businessNumber: "installer-a",
        branchName: "최근요청기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        monthlyDispatchCount: 1,
        lastRequestedAt: new Date("2026-06-12T00:00:00.000Z"),
      },
      {
        ...baseInstaller,
        businessNumber: "installer-c",
        branchName: "오래전요청기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        monthlyDispatchCount: 1,
        lastRequestedAt: new Date("2026-06-10T00:00:00.000Z"),
      },
      {
        ...baseInstaller,
        businessNumber: "installer-b",
        branchName: "요청이력없는기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        monthlyDispatchCount: 1,
        lastRequestedAt: null,
      },
    ]);

    expect(result.map((installer) => installer.businessNumber)).toEqual([
      "installer-b",
      "installer-c",
      "installer-a",
    ]);
  });

  it("excludes installers whose impossible region matches the address", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      {
        ...baseInstaller,
        businessNumber: "excluded-installer",
        branchName: "강남제외기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        impossibleRegion: "서울 강남구",
      },
      {
        ...baseInstaller,
        businessNumber: "available-installer",
        branchName: "강남가능기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
      },
    ]);

    expect(result.map((installer) => installer.businessNumber)).toEqual([
      "available-installer",
    ]);
  });

  it("matches compact city or district tokens by common Korean administrative suffixes", () => {
    const result = findBestMatchingInstallers("경기 성남시 분당구 판교역로 1", [
      {
        ...baseInstaller,
        businessNumber: "city-token",
        branchName: "성남기사",
        installationRegion: "",
        possibleRegion: "성남",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].businessNumber).toBe("city-token");
    expect(result[0].matchTier).toBe("EXACT_DISTRICT");
  });

  it("treats universal installation regions as region-only candidates", () => {
    const result = findBestMatchingInstallers("제주 제주시 첨단로 1", [
      {
        ...baseInstaller,
        businessNumber: "universal-installer",
        branchName: "전국기사",
        installationRegion: "전국",
        possibleRegion: "",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].businessNumber).toBe("universal-installer");
    expect(result[0].matchTier).toBe("REGION_ONLY");
  });

  it("ignores parenthetical excluded text when splitting service area tokens", () => {
    const result = findBestMatchingInstallers("경기 성남시 분당구 판교역로 1", [
      {
        ...baseInstaller,
        businessNumber: "installer-1",
        branchName: "경기기사",
        installationRegion: "경기(성남 제외)",
        possibleRegion: "",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].businessNumber).toBe("installer-1");
    expect(result[0].matchTier).toBe("REGION_ONLY");
  });

  it("returns an empty result for blank addresses when custom installers are provided", () => {
    const result = findBestMatchingInstallers("   ", [
      {
        ...baseInstaller,
        businessNumber: "installer-1",
        branchName: "서울기사",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
      },
    ]);

    expect(result).toEqual([]);
  });

  it("does not use a bundled installer directory when no real installer list is provided", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1");

    expect(result).toEqual([]);
  });
});
