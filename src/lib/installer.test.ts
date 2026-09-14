import { describe, expect, it } from "vitest";
import { parseInstallerPatch, parseInstallerPayload } from "./installer";

describe("parseInstallerPayload (새 기사)", () => {
  it("빠진 항목을 기본값으로 채운다", () => {
    const data = parseInstallerPayload({ name: "홍길동", phone: "010-1234-5678" });
    expect(data.phone).toBe("01012345678");
    expect(data.serviceAreas).toEqual([]);
    expect(data.capabilities).toEqual([]);
    expect(data.aqaraAppCapability).toBe("NONE");
    expect(data.hasAqaraHubInventory).toBe(false);
    expect(data.active).toBe(true);
    expect(data.asEmergencyAvailability).toBeNull();
  });

  it("이름과 전화번호를 요구한다", () => {
    expect(() => parseInstallerPayload({ phone: "01012345678" })).toThrow("NAME_REQUIRED");
    expect(() => parseInstallerPayload({ name: "홍길동", phone: "123" })).toThrow("INVALID_PHONE");
  });
});

describe("parseInstallerPatch (기존 기사 수정)", () => {
  it("보낸 항목만 반영한다", () => {
    const data = parseInstallerPatch({ branch: "전국열쇠" });
    expect(data).toEqual({ branch: "전국열쇠" });
  });

  it("보내지 않은 항목은 아예 넣지 않는다", () => {
    // 이게 이 함수의 핵심이다. 관리 화면 폼에 담당지역·설치가능항목·연동등급·
    // 허브보유·활성이 없던 탓에, 기사 한 명을 저장할 때마다 이 다섯이
    // 기본값으로 덮여 배차에서 사라지곤 했다.
    const data = parseInstallerPatch({ name: "홍길동", phone: "01012345678" });
    expect(Object.keys(data).sort()).toEqual(["name", "phone"]);
    for (const key of [
      "serviceAreas",
      "capabilities",
      "aqaraAppCapability",
      "hasAqaraHubInventory",
      "active",
    ]) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it("빈 값을 명시적으로 보내면 그건 반영한다", () => {
    // "안 보냈다" 와 "비우겠다" 는 다르다. 후자는 의도된 수정이다.
    expect(parseInstallerPatch({ branch: "" })).toEqual({ branch: null });
    expect(parseInstallerPatch({ serviceAreas: [] })).toEqual({ serviceAreas: [] });
    expect(parseInstallerPatch({ capabilities: [] })).toEqual({ capabilities: [] });
  });

  it("false 와 0 을 '안 보냄' 으로 오해하지 않는다", () => {
    expect(parseInstallerPatch({ active: false })).toEqual({ active: false });
    expect(parseInstallerPatch({ hasAqaraHubInventory: false })).toEqual({
      hasAqaraHubInventory: false,
    });
    expect(parseInstallerPatch({ installCount: 0 })).toEqual({ installCount: 0 });
  });

  it("값이 있으면 새 기사와 같은 규칙으로 검증한다", () => {
    expect(() => parseInstallerPatch({ name: "  " })).toThrow("NAME_REQUIRED");
    expect(() => parseInstallerPatch({ phone: "123" })).toThrow("INVALID_PHONE");
    expect(() => parseInstallerPatch({ capabilities: ["NOPE"] })).toThrow("INVALID_CAPABILITY");
    expect(() => parseInstallerPatch({ aqaraAppCapability: "NOPE" })).toThrow(
      "INVALID_AQARA_APP_CAPABILITY",
    );
  });

  it("A/S 긴급출동 가능여부를 받는다", () => {
    expect(parseInstallerPatch({ asEmergencyAvailability: "주중 / 야간 모두 가능" })).toEqual({
      asEmergencyAvailability: "주중 / 야간 모두 가능",
    });
  });

  it("명단 반영 여부(inCurrentRoster)는 손으로 못 바꾼다", () => {
    // 이 값은 기사 명단 반영 스크립트가 관리한다. 화면에서 고쳐 봐야
    // 다음 반영 때 덮어써지므로, 아예 받지 않는다.
    expect(() => parseInstallerPatch({ inCurrentRoster: true })).toThrow("NO_FIELDS_TO_UPDATE");
  });

  it("바꿀 게 하나도 없으면 거부한다", () => {
    expect(() => parseInstallerPatch({})).toThrow("NO_FIELDS_TO_UPDATE");
  });
});
