import { describe, expect, it } from "vitest";
import { hasPartnerServiceItem, parsePartnerInstallItems, shouldRouteToPartner } from "@/lib/installation/partner/routing";

describe("partner routing", () => {
  it("routes orders with a non-doorlock service item, even when mixed with a doorlock", () => {
    expect(hasPartnerServiceItem("스마트 도어락 K100 x1 / 용역 도어벨 상시전원 설치비 (부자재 비용 현장 결제) x1 / 용역 출장비 x1")).toBe(true);
    expect(hasPartnerServiceItem("슬림 면조명 x2 / 용역 슬림 면조명 설치서비스 x1")).toBe(true);
    expect(hasPartnerServiceItem("용역 조명 스위치 설치비 x3")).toBe(true);
    expect(hasPartnerServiceItem("★용역 커튼/블라인드 실측 서비스 x1")).toBe(true);
    expect(hasPartnerServiceItem("길이조절 커튼 레일 설치 + 출장비 x1")).toBe(true);
  });

  it("keeps doorlock-team service items (출장비, 도어락, 월패드 모듈, 연동, 스마트홈) in house", () => {
    expect(
      hasPartnerServiceItem(
        "RF 447 송수신기 모듈 x1 / 용역 출장비 x1 / 용역 도어락 설치비(K100) x1 / 용역 월패드 모듈 설치비 x1",
      ),
    ).toBe(false);
    expect(hasPartnerServiceItem("용역 도어락 설치비(L100)+월패드 연동(RF447) x1 / 용역 연동 설치비 (현장결제) x1")).toBe(false);
    expect(hasPartnerServiceItem("조명 스위치 H2 x3 / 용역 스마트홈 설치 서비스 x1")).toBe(false);
    expect(hasPartnerServiceItem("스마트 도어락 K100 x1 / 용역매출 x1 / 용역 출장비 x1")).toBe(false);
    expect(hasPartnerServiceItem(null)).toBe(false);
  });

  it("lets an admin override win over the memo", () => {
    const memo = "용역 조명 스위치 설치비 x1";
    expect(shouldRouteToPartner({ memo, partnerRouting: "INHOUSE" })).toBe(false);
    expect(shouldRouteToPartner({ memo: "도어락 x1", partnerRouting: "PARTNER" })).toBe(true);
    expect(shouldRouteToPartner({ memo, partnerRouting: null })).toBe(true);
  });
});

describe("parsePartnerInstallItems", () => {
  it("lists only the install work in the order, with quantities", () => {
    expect(
      parsePartnerInstallItems(
        "기타 부자재 x360 / (부자재) 초인종 마감판 블랙 x1 / (부자재) DC12V 컨버터 x1 / 용역 도어락 설치비(K100) x1 / 용역 도어벨 상시전원 설치비 (부자재 비용 현장 결제) x1 / 용역 출장비 x1",
      ),
    ).toEqual([
      { label: "도어락 K100 설치", quantity: 1 },
      { label: "도어벨 상시전원 설치", quantity: 1 },
    ]);
  });

  it("cleans up each service item name", () => {
    expect(
      parsePartnerInstallItems(
        "용역 조명 스위치 설치비 x3 / ★용역 커튼/블라인드 실측 서비스 x1 / 길이조절 커튼 레일 설치 + 출장비 x2 / 용역 슬림 면조명 설치서비스 x1 / 용역 연동 설치비 (현장결제) x1 / 용역 커튼레일(커튼 천 결합) 설치비 x1 / 용역 도어락 설치비(L100)+월패드 연동(RF447) x1",
      ),
    ).toEqual([
      { label: "조명 스위치 설치", quantity: 3 },
      { label: "커튼/블라인드 실측 서비스", quantity: 1 },
      { label: "길이조절 커튼 레일 설치 + 출장비", quantity: 2 },
      { label: "슬림 면조명 설치", quantity: 1 },
      { label: "연동 설치", quantity: 1 },
      { label: "커튼레일(커튼 천 결합) 설치", quantity: 1 },
      { label: "도어락 L100 설치+월패드 연동(RF447)", quantity: 1 },
    ]);
  });

  it("returns nothing for products only or an empty memo", () => {
    expect(parsePartnerInstallItems("스마트 도어락 K100 x1 / 용역 출장비 x1")).toEqual([]);
    expect(parsePartnerInstallItems(null)).toEqual([]);
  });
});
