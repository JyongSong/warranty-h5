import { describe, expect, it } from "vitest";
import {
  addKstDays,
  getKstDateString,
  hasPassedKstBusinessDays,
  isKstBusinessDay,
  isKstHolidayDate,
} from "./business-days";

describe("한국 날짜 계산", () => {
  it("UTC 로 늦은 밤이면 한국은 이미 다음 날이다", () => {
    // 09-13 22:00 UTC = 09-14 07:00 KST
    expect(getKstDateString(new Date("2026-09-13T22:00:00.000Z"))).toBe("2026-09-14");
    expect(getKstDateString(new Date("2026-09-14T02:00:00.000Z"))).toBe("2026-09-14");
  });

  it("날짜를 더할 때 달을 넘긴다", () => {
    expect(addKstDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addKstDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("영업일 판정", () => {
  it("주말과 공휴일은 영업일이 아니다", () => {
    expect(isKstHolidayDate("2026-09-12")).toBe(true); // 토
    expect(isKstHolidayDate("2026-09-13")).toBe(true); // 일
    expect(isKstHolidayDate("2026-09-25")).toBe(true); // 추석 연휴
    expect(isKstHolidayDate("2026-09-14")).toBe(false); // 월
  });

  it("한국 날짜 기준으로 영업일을 가린다", () => {
    // 09-25(추석) 08:00 KST = 09-24 23:00 UTC. 서버가 UTC 라도 한국 날짜로 봐야 한다.
    expect(isKstBusinessDay(new Date("2026-09-24T23:00:00.000Z"))).toBe(false);
    expect(isKstBusinessDay(new Date("2026-09-13T22:00:00.000Z"))).toBe(true); // 09-14(월)
  });
});

describe("hasPassedKstBusinessDays", () => {
  const now = new Date("2026-09-14T06:00:00.000Z"); // 09-14(월) 15:00 KST

  it("확정 당일은 세지 않는다", () => {
    expect(hasPassedKstBusinessDays(new Date("2026-09-14T01:00:00.000Z"), 7, now)).toBe(false);
  });

  it("주말을 건너뛰고 영업일만 센다", () => {
    // 09-02(수) 확정 → 03,04,07,08,09,10,11 = 7영업일 (14일 시점)
    expect(hasPassedKstBusinessDays(new Date("2026-09-02T01:00:00.000Z"), 7, now)).toBe(true);
    // 09-03(목) 확정 → 04,07,08,09,10,11,14 = 7영업일
    expect(hasPassedKstBusinessDays(new Date("2026-09-03T01:00:00.000Z"), 7, now)).toBe(true);
    // 09-04(금) 확정 → 07,08,09,10,11,14 = 6영업일. 아직 이르다.
    expect(hasPassedKstBusinessDays(new Date("2026-09-04T01:00:00.000Z"), 7, now)).toBe(false);
  });

  it("확정 시각이 한국 기준 자정 직전이어도 그 날짜로 센다", () => {
    // 09-03 23:30 KST = 09-03 14:30 UTC. UTC 로 끊으면 09-03, 한국으로도 09-03.
    expect(hasPassedKstBusinessDays(new Date("2026-09-03T14:30:00.000Z"), 7, now)).toBe(true);
    // 09-04 00:30 KST = 09-03 15:30 UTC. UTC 로 끊으면 09-03(7영업일)이지만
    // 한국 날짜로는 09-04 라서 아직 6영업일이다.
    expect(hasPassedKstBusinessDays(new Date("2026-09-03T15:30:00.000Z"), 7, now)).toBe(false);
  });
});
