import { describe, expect, it } from "vitest";
import { hasPartnerServiceItem, shouldRouteToPartner } from "@/lib/installation/partner/routing";

describe("partner routing", () => {
  it("routes orders with a 조명/월패드 설치비 item, even when mixed with a doorlock", () => {
    expect(hasPartnerServiceItem("스마트 도어락 K100 x1 / 용역 월패드 모듈 설치비 x1 / 용역 출장비 x1")).toBe(true);
    expect(hasPartnerServiceItem("슬림 면조명 x2 / 용역 슬림 면조명 설치서비스 x1")).toBe(true);
    expect(hasPartnerServiceItem("용역 조명 스위치 설치비 x3")).toBe(true);
  });

  it("does not route product-only 월패드/허브 orders or doorlock-only orders", () => {
    expect(hasPartnerServiceItem("[스마트홈 여름 준비 패키지_앱+허브 설치] 월패드 연동 모듈 x1 / 용역 도어락 설치비(L100) x1")).toBe(false);
    expect(hasPartnerServiceItem("스마트 도어락 K100 x1 / 용역 도어락 설치비(K100) x1")).toBe(false);
    expect(hasPartnerServiceItem(null)).toBe(false);
  });

  it("lets an admin override win over the memo", () => {
    const memo = "용역 월패드 모듈 설치비 x1";
    expect(shouldRouteToPartner({ memo, partnerRouting: "INHOUSE" })).toBe(false);
    expect(shouldRouteToPartner({ memo: "도어락 x1", partnerRouting: "PARTNER" })).toBe(true);
    expect(shouldRouteToPartner({ memo, partnerRouting: null })).toBe(true);
  });
});
