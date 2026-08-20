import { describe, expect, it } from "vitest";
import {
  computeAsLineItems,
  computeInstallLineItems,
  isNight,
  isWeekend,
  parseKstDateTimeLocal,
  linkageFeeForCapability,
} from "./compute";
import type { EffectiveRates } from "./rates";

const RATES: EffectiveRates = {
  linkageAppFee: 10000,
  linkageHubFee: 25000,
  travelFee: 15000,
  nightSurcharge: 5000,
  weekendSurcharge: 7000,
  nightStartHour: 20,
  nightEndHour: 6,
};

// A KST wall-clock time → the UTC Date it corresponds to (KST = UTC+9).
function kst(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, 0, 0));
}

describe("linkageFeeForCapability", () => {
  it("bills by actual achieved level (§6.4C)", () => {
    expect(linkageFeeForCapability("NONE", RATES)).toBe(0);
    expect(linkageFeeForCapability("DOORLOCK_AND_APP", RATES)).toBe(10000);
    expect(linkageFeeForCapability("DOORLOCK_AND_APP_AND_HUB", RATES)).toBe(25000);
  });
});

describe("isNight (wrap-around window 20:00→06:00 KST)", () => {
  it("is night at 22:00 and 03:00 KST", () => {
    expect(isNight(kst("2026-08-12", 22), 20, 6)).toBe(true);
    expect(isNight(kst("2026-08-12", 3), 20, 6)).toBe(true);
  });
  it("is not night at 14:00 KST", () => {
    expect(isNight(kst("2026-08-12", 14), 20, 6)).toBe(false);
  });
  it("boundary: 20:00 night, 06:00 not", () => {
    expect(isNight(kst("2026-08-12", 20), 20, 6)).toBe(true);
    expect(isNight(kst("2026-08-12", 6), 20, 6)).toBe(false);
  });
});

describe("parseKstDateTimeLocal", () => {
  // 서버(UTC)에서 new Date("2026-08-20T15:23") 로 읽으면 KST 다음날 00:23 이
  // 되어 야간 할증이 잘못 붙었다. 실제로 운영에서 발생한 건이다.
  it("reads the wall-clock value as KST, not as server-local time", () => {
    expect(parseKstDateTimeLocal("2026-08-20T15:23")?.toISOString()).toBe(
      "2026-08-20T06:23:00.000Z",
    );
  });

  it("keeps a daytime install out of the night window", () => {
    const parsed = parseKstDateTimeLocal("2026-08-20T15:23")!;
    expect(isNight(parsed, 20, 6)).toBe(false);
  });

  it("does not roll a Friday evening into Saturday", () => {
    // 금요일 22:00 KST. UTC 로 잘못 읽으면 토요일 07:00 KST 가 되어
    // 휴일 할증까지 붙는다.
    const parsed = parseKstDateTimeLocal("2026-08-21T22:00")!;
    expect(isNight(parsed, 20, 6)).toBe(true);
    expect(isWeekend(parsed)).toBe(false);
  });

  it("accepts seconds and rejects junk", () => {
    expect(parseKstDateTimeLocal("2026-08-20T15:23:45")?.toISOString()).toBe(
      "2026-08-20T06:23:45.000Z",
    );
    expect(parseKstDateTimeLocal("")).toBeNull();
    expect(parseKstDateTimeLocal("2026-08-20")).toBeNull();
  });
});

describe("isWeekend (KST)", () => {
  it("Sat/Sun are weekend, Wed is not", () => {
    expect(isWeekend(kst("2026-08-15", 12))).toBe(true); // Sat
    expect(isWeekend(kst("2026-08-16", 12))).toBe(true); // Sun
    expect(isWeekend(kst("2026-08-12", 12))).toBe(false); // Wed
  });

  // UI 문안은 "야간/휴일"이지만 실제로 보는 건 토·일요일뿐이다.
  // 평일에 걸린 법정공휴일에는 할증이 붙지 않는다.
  it("does not treat a weekday public holiday as 휴일", () => {
    expect(isWeekend(kst("2026-05-05", 12))).toBe(false); // 어린이날 (화)
    expect(isWeekend(kst("2026-10-09", 12))).toBe(false); // 한글날 (금)
    expect(isWeekend(kst("2026-12-25", 12))).toBe(false); // 성탄절 (금)
  });
});

describe("computeInstallLineItems", () => {
  it("weekday daytime app install: linkage + travel only", () => {
    const { items } = computeInstallLineItems({
      achievedAqaraAppCapability: "DOORLOCK_AND_APP",
      longDistanceAmount: null,
      wallpadAmount: null,
      installEndAt: kst("2026-08-12", 14), // Wed 14:00
      rates: RATES,
    });
    expect(items.linkageFee).toBe(10000);
    expect(items.travelFee).toBe(15000);
    expect(items.nightWeekendFee).toBe(0);
    expect(items.totalAmount).toBe(25000);
  });

  it("weekend night hub install with long-distance: all surcharges stack", () => {
    const { items } = computeInstallLineItems({
      achievedAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
      longDistanceAmount: 30000,
      wallpadAmount: 50000,
      installEndAt: kst("2026-08-15", 22), // Sat 22:00 → night + weekend
      rates: RATES,
    });
    expect(items.linkageFee).toBe(25000);
    expect(items.travelFee).toBe(15000);
    expect(items.longDistanceFee).toBe(30000);
    expect(items.nightWeekendFee).toBe(12000); // 5000 + 7000
    // wallpad is recorded but NOT in payable total
    expect(items.wallpadAmount).toBe(50000);
    expect(items.totalAmount).toBe(82000); // 25000+15000+30000+12000
  });

  it("NONE capability: no linkage fee", () => {
    const { items } = computeInstallLineItems({
      achievedAqaraAppCapability: "NONE",
      longDistanceAmount: null,
      wallpadAmount: null,
      installEndAt: kst("2026-08-12", 14),
      rates: RATES,
    });
    expect(items.linkageFee).toBe(0);
    expect(items.totalAmount).toBe(15000); // travel only
  });
});

describe("computeAsLineItems", () => {
  it("payable = approved service fee only", () => {
    expect(computeAsLineItems(40000).totalAmount).toBe(40000);
    expect(computeAsLineItems(null).totalAmount).toBe(0);
    expect(computeAsLineItems(-5).totalAmount).toBe(0);
  });
});
