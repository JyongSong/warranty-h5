import { describe, expect, it } from "vitest";
import { buildInstallerMatcher, type MatchableInstaller } from "@/lib/backoffice/as-history-match";

const installers: MatchableInstaller[] = [
  { id: "i1", name: "장혁신", branch: "키플레이", active: true },
  { id: "i2", name: "이성규", branch: "신우열쇠", active: true },
  { id: "i3", name: "김경민", branch: "경기열쇠상사", active: true },
  { id: "i4", name: "박세민", branch: "의정부/롯데마트장암점", active: true },
  { id: "i5", name: "김규민", branch: "PL", active: true },
  { id: "i6", name: "황규정", branch: "PL", active: true },
  { id: "i7", name: "이하영", branch: "경기광주/청도열쇠상사", active: true },
];

const match = buildInstallerMatcher(installers);

describe("기사명 매칭", () => {
  it("이름이 그대로 적힌 건은 기사까지 확정한다", () => {
    expect(match({ installerNameRaw: "김규민", vendorName: "피엘이앤지" })).toEqual({
      installerId: "i5",
      branch: "PL",
      matchedBy: "INSTALLER_NAME",
    });
  });

  it("업체가 앞뒤로 붙어 있어도 이름을 뽑아낸다", () => {
    expect(match({ installerNameRaw: "키플레이 장혁신", vendorName: "키플레이" }).installerId).toBe("i1");
    expect(match({ installerNameRaw: "이성규(신우열쇠)", vendorName: "관악/신우열쇠" }).installerId).toBe("i2");
    expect(match({ installerNameRaw: "ㅇ이성규(신우열쇠)", vendorName: "관악/신우열쇠" }).installerId).toBe("i2");
  });

  it("한 건에 기사가 둘이면 확정하지 않고 업체로 떨어뜨린다", () => {
    // ERP 에 "송재민,황규정" 처럼 적힌 건이 있다. 아무나 고르면 실적이 틀어진다.
    const result = match({ installerNameRaw: "황규정,김규민", vendorName: "피엘이앤지" });
    expect(result.installerId).toBeNull();
    expect(result.matchedBy).toBe("VENDOR_NAME");
  });

  it("기사칸에 날짜가 잘못 들어간 건은 업체로 떨어뜨린다", () => {
    expect(match({ installerNameRaw: "26.06.16", vendorName: "경기열쇠상사" })).toEqual({
      installerId: null,
      branch: "경기열쇠상사",
      matchedBy: "VENDOR_NAME",
    });
  });

  it("퇴사자·미등록 기사는 기사로 확정하지 않는다", () => {
    expect(match({ installerNameRaw: "윤치연", vendorName: "피엘이앤지" }).matchedBy).toBe("VENDOR_NAME");
  });
});

describe("거래처 매칭", () => {
  it("별칭표로 상호명 차이를 넘긴다", () => {
    expect(match({ installerNameRaw: null, vendorName: "피엘이앤지" }).branch).toBe("PL");
  });

  it("지역 접두사가 붙어 있어도 지점을 찾는다", () => {
    expect(match({ installerNameRaw: null, vendorName: "관악/신우열쇠" }).branch).toBe("신우열쇠");
  });

  it("표기 흔들림(공백·오타 꼬리)을 흡수한다", () => {
    expect(match({ installerNameRaw: null, vendorName: "의정부/롯데마트 장암점" }).branch).toBe(
      "의정부/롯데마트장암점",
    );
    expect(match({ installerNameRaw: null, vendorName: "경기광주/청도열쇠상사e" }).branch).toBe(
      "경기광주/청도열쇠상사",
    );
  });

  it("업체도 기사도 못 찾으면 NONE 으로 두고 버리지는 않는다", () => {
    expect(match({ installerNameRaw: null, vendorName: "" })).toEqual({
      installerId: null,
      branch: null,
      matchedBy: "NONE",
    });
  });

  it("업체만 아는 건은 기사를 비워 둔다 — 한 업체에 기사가 여럿이다", () => {
    const result = match({ installerNameRaw: null, vendorName: "경기열쇠상사" });
    expect(result.installerId).toBeNull();
    expect(result.branch).toBe("경기열쇠상사");
  });
});
