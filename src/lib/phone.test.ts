import { describe, expect, it } from "vitest";
import { isKoreanMobileNumber, isSafeVirtualNumber } from "@/lib/phone";

describe("isSafeVirtualNumber", () => {
  it("detects 050 안심번호", () => {
    // 실제 주문에서 들어온 형태
    expect(isSafeVirtualNumber("0503-6318-9916")).toBe(true);
    expect(isSafeVirtualNumber("05036318991")).toBe(true);
    expect(isSafeVirtualNumber("0504-1234-5678")).toBe(true);
  });

  it("does not flag real mobiles", () => {
    expect(isSafeVirtualNumber("010-1234-5678")).toBe(false);
    expect(isSafeVirtualNumber("01012345678")).toBe(false);
  });
});

describe("isKoreanMobileNumber", () => {
  it("accepts 01X mobiles", () => {
    expect(isKoreanMobileNumber("010-1234-5678")).toBe(true);
    expect(isKoreanMobileNumber("011-234-5678")).toBe(true);
    expect(isKoreanMobileNumber("017-123-4567")).toBe(true);
  });

  it("rejects 안심번호, 유선, 잘린 번호", () => {
    expect(isKoreanMobileNumber("0503-6318-9916")).toBe(false);
    expect(isKoreanMobileNumber("02-123-4567")).toBe(false);
    expect(isKoreanMobileNumber("010-1234")).toBe(false);
    expect(isKoreanMobileNumber("")).toBe(false);
  });
});
