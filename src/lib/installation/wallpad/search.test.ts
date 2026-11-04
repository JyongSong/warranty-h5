import { describe, expect, it } from "vitest";
import { siteNameFromAddress, wallpadModelKey, wallpadSiteAddress, wallpadSiteKey } from "./normalize";
import { groupCasesBySite, searchWallpadCompat, tallyCasesByModel } from "./search";

describe("wallpad normalize", () => {
  it("모델명은 대소문자·하이픈·공백을 무시한다", () => {
    expect(wallpadModelKey("KHN-Q100LT")).toBe(wallpadModelKey("khn q100lt"));
  });

  it("주소에서 도로명+건물번호만 남긴다", () => {
    expect(wallpadSiteAddress("인천 연수구 송도문화로28번길 27 1동 1호")).toBe("인천 연수구 송도문화로28번길 27");
    expect(wallpadSiteAddress("12345 경기 평택시 용죽1로 10 (용죽동, 평택센트럴자이3단지) 301동 1203호")).toBe(
      "경기 평택시 용죽1로 10",
    );
    expect(wallpadSiteAddress("서울 강남구 대치동 123")).toBeNull();
  });

  it("같은 단지의 다른 동·호수는 같은 키가 된다", () => {
    const a = wallpadSiteKey(wallpadSiteAddress("서울 강남구 테헤란로 152 2동 2호"));
    const b = wallpadSiteKey(wallpadSiteAddress("서울  강남구 테헤란로 152 101동 1203호"));
    expect(a).toBe(b);
  });

  it("주소 참고항목에서 아파트명을 꺼낸다", () => {
    expect(siteNameFromAddress("경기 평택시 용죽1로 10 (용죽동, 평택센트럴자이3단지)")).toBe("평택센트럴자이3단지");
    expect(siteNameFromAddress("경기 평택시 용죽1로 10 (용죽동)")).toBeNull();
    expect(siteNameFromAddress("경기 평택시 용죽1로 10")).toBeNull();
  });
});

const models = [
  { id: "m1", brand: "코콤", model: "KHN-Q100LT", aliases: [] },
  { id: "m2", brand: "현대통신", model: "DMHNT-4105Y-W", aliases: ["DMHNT-4105Y"] },
];
const cases = [
  { siteName: "용인 롯데캐슬 클라시에", siteKey: null, siteAddress: null, brand: "코콤", model: "khn-q100lt", result: "SUCCESS" },
  { siteName: "평택센트럴자이3단지", siteKey: "k1", siteAddress: "경기 평택시 용죽1로 10", brand: null, model: "DMHNT 4105Y", result: "FAIL" },
  { siteName: "평택센트럴자이 3단지", siteKey: "k1", siteAddress: "경기 평택시 용죽1로 10", brand: null, model: null, result: "SUCCESS" },
];
const notes = [{ title: "자이 · GS건설", keywords: ["자이", "Xi", "GS건설"] }];

describe("searchWallpadCompat", () => {
  it("모델명 일부로 모델과 사례를 찾는다", () => {
    const result = searchWallpadCompat({ models, cases, notes }, "q100");
    expect(result.models.map((m) => m.id)).toEqual(["m1"]);
    expect(result.cases).toHaveLength(1);
  });

  it("별칭으로도 모델을 찾는다", () => {
    expect(searchWallpadCompat({ models, cases, notes }, "dmhnt4105y").models.map((m) => m.id)).toEqual(["m2"]);
  });

  it("단지명에 시공사 키워드가 들어 있으면 의견도 함께 찾는다", () => {
    const result = searchWallpadCompat({ models, cases, notes }, "평택센트럴자이");
    expect(result.cases).toHaveLength(2);
    expect(result.notes).toHaveLength(1);
  });

  it("제조사명으로 모델을 찾는다", () => {
    expect(searchWallpadCompat({ models, cases, notes }, "코콤").models.map((m) => m.id)).toEqual(["m1"]);
  });

  it("빈 검색어는 아무것도 돌려주지 않는다", () => {
    expect(searchWallpadCompat({ models, cases, notes }, "  ").models).toEqual([]);
  });
});

describe("tally / group", () => {
  it("사례를 모델별로 센다(별칭 포함)", () => {
    const tallies = tallyCasesByModel(models, cases);
    expect(tallies.get("m1")).toEqual({ success: 1, fail: 0, special: 0 });
    expect(tallies.get("m2")).toEqual({ success: 0, fail: 1, special: 0 });
  });

  it("주소 키가 같으면 단지명이 달라도 한 단지로 묶는다", () => {
    const groups = groupCasesBySite(cases);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.key === "k1")?.tally).toEqual({ success: 1, fail: 1, special: 0 });
  });
});
