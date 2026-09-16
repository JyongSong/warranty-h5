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

describe("시/도 표기가 달라도 매칭된다", () => {
  // 주소는 Daum 우편번호(shorthand 기본값)가 주는 약식, service_areas 는 정식으로
  // 적힌 경우가 실제 데이터의 대부분이다. 이 조합이 예전에는 통째로 누락됐다.
  const installerWith = (region: string, serviceArea: string) => ({
    ...baseInstaller,
    businessNumber: "installer-1",
    branchName: "기사",
    installationRegion: region,
    possibleRegion: serviceArea,
  });

  const pairs: Array<[string, string, string]> = [
    ["서울특별시", "서울특별시 강남구", "서울 강남구 테헤란로 1"],
    ["서울", "서울 강남구", "서울특별시 강남구 테헤란로 1"],
    ["경기도", "경기도 성남시 분당구", "경기 성남시 분당구 판교역로 1"],
    ["경기", "경기 성남시 분당구", "경기도 성남시 분당구 판교역로 1"],
    ["경상북도", "경상북도 경산시", "경북 경산시 중앙로 1"],
    ["충청남도", "충청남도 천안시", "충남 천안시 동남구 1"],
    ["강원특별자치도", "강원특별자치도 춘천시", "강원 춘천시 중앙로 1"],
    ["부산광역시", "부산광역시 해운대구", "부산 해운대구 1"],
  ];

  for (const [region, serviceArea, address] of pairs) {
    it(`"${serviceArea}" 기사가 "${address}" 주문의 후보가 된다`, () => {
      const result = findBestMatchingInstallers(address, [installerWith(region, serviceArea)]);

      expect(result).toHaveLength(1);
      expect(result[0].matchTier).toBe("EXACT_DISTRICT");
    });
  }

  it("전북특별자치도와 옛 이름 전라북도를 같은 지역으로 본다", () => {
    const installer = installerWith("전북특별자치도", "전북특별자치도 김제시");

    for (const address of ["전북 김제시 1", "전라북도 김제시 1", "전북특별자치도 김제시 1"]) {
      const result = findBestMatchingInstallers(address, [installer]);
      expect(result, address).toHaveLength(1);
      expect(result[0].matchTier, address).toBe("EXACT_DISTRICT");
    }
  });

  it("표기만 다른 두 기사는 동등하게 경쟁한다", () => {
    const result = findBestMatchingInstallers("서울 강남구 테헤란로 1", [
      { ...baseInstaller, businessNumber: "b-정식", branchName: "정식", installationRegion: "서울특별시", possibleRegion: "서울특별시 강남구" },
      { ...baseInstaller, businessNumber: "a-약식", branchName: "약식", installationRegion: "서울", possibleRegion: "서울 강남구" },
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.matchTier === "EXACT_DISTRICT")).toBe(true);
  });

  it("광역시 광주와 경기도 광주시를 섞지 않는다", () => {
    const 광주광역시기사 = { ...baseInstaller, businessNumber: "gwangju-metro", branchName: "광주기사", installationRegion: "광주", possibleRegion: "광주 북구" };

    // 경기도 광주시 주문에 광주광역시 기사가 끌려오면 안 된다.
    expect(findBestMatchingInstallers("경기 광주시 오포읍 1", [광주광역시기사])).toHaveLength(0);
    // 자기 지역에서는 정상으로 잡힌다.
    expect(findBestMatchingInstallers("광주 북구 중앙로 1", [광주광역시기사])).toHaveLength(1);
  });
});
