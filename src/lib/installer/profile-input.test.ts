import { describe, expect, it } from "vitest";
import { parseInstallerProfileInput } from "./profile-input";

const valid = {
  name: "홍길동",
  address: "서울특별시 강남구 논현로 127길 13-11 3층",
  aqaraAppCapability: "DOORLOCK_AND_APP",
  asEmergencyAvailability: "가능",
};

describe("parseInstallerProfileInput", () => {
  it("올바른 입력을 그대로 돌려준다", () => {
    expect(parseInstallerProfileInput(valid)).toEqual(valid);
  });

  it("이름과 주소의 공백을 정리한다", () => {
    const parsed = parseInstallerProfileInput({
      ...valid,
      name: "  홍  길동 ",
      address: " 서울시  강남구 ",
    });
    expect(parsed.name).toBe("홍 길동");
    expect(parsed.address).toBe("서울시 강남구");
  });

  it("이름은 필수다", () => {
    expect(() => parseInstallerProfileInput({ ...valid, name: "   " })).toThrow("NAME_REQUIRED");
    expect(() => parseInstallerProfileInput({ ...valid, name: undefined })).toThrow("NAME_REQUIRED");
  });

  it("주소는 필수다", () => {
    expect(() => parseInstallerProfileInput({ ...valid, address: "" })).toThrow("ADDRESS_REQUIRED");
  });

  it("연동 능력은 정해진 세 값만 받는다", () => {
    for (const value of ["NONE", "DOORLOCK_AND_APP", "DOORLOCK_AND_APP_AND_HUB"]) {
      expect(parseInstallerProfileInput({ ...valid, aqaraAppCapability: value })).toBeTruthy();
    }
    // 화면을 우회해 임의의 값을 보내도 통과하면 안 된다.
    expect(() => parseInstallerProfileInput({ ...valid, aqaraAppCapability: "SUPER" })).toThrow(
      "AQARA_APP_CAPABILITY_REQUIRED",
    );
    expect(() => parseInstallerProfileInput({ ...valid, aqaraAppCapability: "" })).toThrow(
      "AQARA_APP_CAPABILITY_REQUIRED",
    );
  });

  it("A/S 긴급출동은 가능·불가 둘만 받는다", () => {
    expect(parseInstallerProfileInput({ ...valid, asEmergencyAvailability: "불가" })).toBeTruthy();
    expect(() =>
      parseInstallerProfileInput({ ...valid, asEmergencyAvailability: "주중만" }),
    ).toThrow("AS_EMERGENCY_REQUIRED");
  });

  it("담당 지역·설치 가능 항목은 아예 받지 않는다", () => {
    // 이 둘은 배차가 직접 보는 값이라 기사가 스스로 바꾸면 배차 결과를
    // 기사 쪽에서 조종할 수 있게 된다. 입력에 섞여 와도 결과에 남지 않아야 한다.
    const parsed = parseInstallerProfileInput({
      ...valid,
      serviceAreas: ["서울특별시 강남구"],
      capabilities: ["DOORLOCK"],
      active: true,
    } as never);
    expect(Object.keys(parsed).sort()).toEqual([
      "address",
      "aqaraAppCapability",
      "asEmergencyAvailability",
      "name",
    ]);
  });
});
