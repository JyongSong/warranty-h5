import { describe, expect, it } from "vitest";
import {
  parseInstallationAddress,
  splitInstallationSourceAddress,
} from "@/lib/installation/customer/address-parser";

describe("parseInstallationAddress", () => {
  it("parses metropolitan city district addresses", () => {
    expect(parseInstallationAddress("서울특별시 강남구 테헤란로 1")).toEqual({
      sido: "서울",
      sigungu: "강남구",
    });
    expect(parseInstallationAddress("부산 해운대구 센텀중앙로 1")).toEqual({
      sido: "부산",
      sigungu: "해운대구",
    });
  });

  it("parses province city and district addresses", () => {
    expect(parseInstallationAddress("경기도 성남시 분당구 판교역로 1")).toEqual({
      sido: "경기",
      sigungu: "성남시 분당구",
    });
  });

  it("통합특별시 주소를 옛 광주/전남으로 해석한다", () => {
    expect(parseInstallationAddress("전남광주통합특별시 북구 첨단과기로 123")).toEqual({
      sido: "광주",
      sigungu: "북구",
    });
    expect(parseInstallationAddress("전남광주통합특별시 광산구 하남대로 1")).toEqual({
      sido: "광주",
      sigungu: "광산구",
    });
    expect(parseInstallationAddress("전남광주통합특별시 화순군 화순읍 1")).toEqual({
      sido: "전남",
      sigungu: "화순군",
    });
    expect(parseInstallationAddress("전남광주통합특별시 순천시 중앙로 1")).toEqual({
      sido: "전남",
      sigungu: "순천시",
    });
    expect(parseInstallationAddress("전남광주통합특별시")).toBeNull();
  });

  it("returns null for unparseable addresses", () => {
    expect(parseInstallationAddress("주소 모름")).toBeNull();
    expect(parseInstallationAddress("서울 테헤란로 1")).toBeNull();
  });
});

describe("splitInstallationSourceAddress", () => {
  it("통합특별시 주소도 시/도·시군구를 나눈다", () => {
    expect(splitInstallationSourceAddress("전남광주통합특별시 북구 첨단과기로 123 101동")).toMatchObject({
      address1: "전남광주통합특별시 북구",
      address2: "첨단과기로 123 101동",
    });
  });

  it("splits source address into full, main, detail, region, and remainder fields", () => {
    expect(splitInstallationSourceAddress("서울시 강남구 테헤란로 123 101동 202호")).toEqual({
      address: "서울시 강남구 테헤란로 123 101동 202호",
      addressMain: "서울시 강남구 테헤란로 123",
      addressDetail: "101동 202호",
      address1: "서울시 강남구",
      address2: "테헤란로 123 101동 202호",
    });
  });

  it("handles province city and district source addresses", () => {
    expect(splitInstallationSourceAddress("경기도 성남시 분당구 판교역로 1 A동 101호")).toEqual({
      address: "경기도 성남시 분당구 판교역로 1 A동 101호",
      addressMain: "경기도 성남시 분당구 판교역로 1",
      addressDetail: "A동 101호",
      address1: "경기도 성남시 분당구",
      address2: "판교역로 1 A동 101호",
    });
  });
});
