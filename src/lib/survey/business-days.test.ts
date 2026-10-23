import { describe, expect, it } from "vitest";
import {
  addKstDays,
  getKstDateString,
  getKstSurveySendDate,
  hasReachedKstSurveySendDate,
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

describe("getKstSurveySendDate", () => {
  it("확정일 + 7일이 영업일이면 그날이다", () => {
    // 09-07(월) 확정 → 09-14(월)
    expect(getKstSurveySendDate(new Date("2026-09-07T01:00:00.000Z"), 7)).toBe("2026-09-14");
  });

  it("확정일 + 7일이 주말이면 다음 첫 영업일로 미룬다", () => {
    // 09-05(토) 확정 → 09-12(토) → 09-14(월)
    expect(getKstSurveySendDate(new Date("2026-09-05T01:00:00.000Z"), 7)).toBe("2026-09-14");
  });

  it("공휴일과 이어지는 주말을 모두 건너뛴다", () => {
    // 09-17(목) 확정 → 09-24(추석) → 25(추석), 26(토), 27(일) → 09-28(월)
    expect(getKstSurveySendDate(new Date("2026-09-17T01:00:00.000Z"), 7)).toBe("2026-09-28");
  });

  it("확정 시각은 한국 날짜로 끊는다", () => {
    // 09-08 00:30 KST = 09-07 15:30 UTC. 한국 날짜 09-08 → 09-15
    expect(getKstSurveySendDate(new Date("2026-09-07T15:30:00.000Z"), 7)).toBe("2026-09-15");
  });
});

describe("hasReachedKstSurveySendDate", () => {
  const now = new Date("2026-09-14T06:00:00.000Z"); // 09-14(월) 15:00 KST

  it("발송일 당일이면 보낸다", () => {
    expect(hasReachedKstSurveySendDate(new Date("2026-09-07T01:00:00.000Z"), 7, now)).toBe(true);
  });

  it("발송일이 지난 건도 보낸다", () => {
    expect(hasReachedKstSurveySendDate(new Date("2026-09-02T01:00:00.000Z"), 7, now)).toBe(true);
    // 주말로 밀린 건: 09-05(토) → 09-14(월)
    expect(hasReachedKstSurveySendDate(new Date("2026-09-05T01:00:00.000Z"), 7, now)).toBe(true);
  });

  it("발송일 전이면 기다린다", () => {
    expect(hasReachedKstSurveySendDate(new Date("2026-09-08T01:00:00.000Z"), 7, now)).toBe(false);
    // 09-07 23:30 KST 는 09-07 확정, 09-08 00:30 KST 는 09-08 확정
    expect(hasReachedKstSurveySendDate(new Date("2026-09-07T14:30:00.000Z"), 7, now)).toBe(true);
    expect(hasReachedKstSurveySendDate(new Date("2026-09-07T15:30:00.000Z"), 7, now)).toBe(false);
  });
});
