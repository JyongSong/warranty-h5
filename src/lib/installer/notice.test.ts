import { describe, expect, it } from "vitest";
import type { PartnerInstallItem } from "@/lib/installation/partner/install-items";
import { buildOrderGuideLines, longDistanceTier } from "./notice";

const item = (name: string, extra: Partial<PartnerInstallItem> = {}): PartnerInstallItem => ({
  code: null,
  name,
  quantity: 1,
  onsitePayment: false,
  ...extra,
});

const texts = (lines: ReturnType<typeof buildOrderGuideLines>) => lines.map((line) => line.text).join("\n");

describe("longDistanceTier", () => {
  it("follows the 20km / 40km boundaries (boundary itself is the lower tier)", () => {
    expect(longDistanceTier(null)).toBeNull();
    expect(longDistanceTier(20000)).toBeNull();
    expect(longDistanceTier(20001)?.amount).toBe(20000);
    expect(longDistanceTier(40000)?.amount).toBe(20000);
    expect(longDistanceTier(40001)?.amount).toBe(40000);
  });
});

describe("buildOrderGuideLines", () => {
  it("shows nothing for agent proxy orders", () => {
    expect(buildOrderGuideLines({ installItems: [item("K100도어락설치")], agentProxy: true, drivingMeters: 50000 })).toEqual([]);
  });

  it("always shows base fee and app linkage fees, skips distance when unknown", () => {
    const out = texts(buildOrderGuideLines({ installItems: [item("K100도어락설치")], agentProxy: false, drivingMeters: null }));
    expect(out).toContain("기본 설치비 50,000원");
    expect(out).toContain("앱 설치 5,000원");
    expect(out).not.toContain("장거리");
    expect(out).not.toContain("월패드");
  });

  it("shows the expected long-distance amount", () => {
    expect(texts(buildOrderGuideLines({ installItems: [], agentProxy: false, drivingMeters: 32400 }))).toContain(
      "장거리 예상 20,000원 (약 32.4km",
    );
    expect(texts(buildOrderGuideLines({ installItems: [], agentProxy: false, drivingMeters: 8000 }))).toContain(
      "장거리 해당 없음",
    );
  });

  it("tells HQ-claim wallpad orders not to charge the customer", () => {
    const out = texts(
      buildOrderGuideLines({
        installItems: [item("월패드연동설치", { code: "00046", hqClaim: true })],
        agentProxy: false,
        drivingMeters: null,
      }),
    );
    expect(out).toContain("고객에게 따로 받지 마세요");
    expect(out).toContain("아카라라이프");
    expect(out).not.toContain("(현장 결제)");
  });

  it("tells onsite wallpad orders to collect from the customer", () => {
    const out = texts(
      buildOrderGuideLines({
        installItems: [item("월패드연동설치", { code: "00046", onsitePayment: true })],
        agentProxy: false,
        drivingMeters: null,
      }),
    );
    expect(out).toContain("(현장 결제) 월패드 연동: 현행 기준대로 고객에게 직접 받습니다.");
  });

  it("adds doorbell and curtain/blind notes", () => {
    const out = texts(
      buildOrderGuideLines({
        installItems: [item("도어벨설치"), item("블라인드 설치")],
        agentProxy: false,
        drivingMeters: null,
      }),
    );
    expect(out).toContain("도어벨은 상시전원 설치 기준");
    expect(out).toContain("커튼/블라인드 설치비는 기준 검토 중");
  });
});
