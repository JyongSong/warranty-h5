// 만족도 조사 발송 기준이 되는 한국 영업일 계산.
//
// 화면(발송 대기 집계)과 자동 발송 cron 이 같은 판정을 써야 한다. 예전에는
// 화면·엑셀·cron 이 각자 같은 함수를 복사해 갖고 있었고, 그 함수들이 서버
// 로컬 시각(배포 환경에서는 UTC)으로 날짜를 끊어서 한국 날짜와 최대 하루까지
// 어긋났다. 여기서는 전부 한국 날짜 문자열(YYYY-MM-DD)로만 계산한다.

// 연말마다 다음 해 공휴일을 추가해야 한다. 목록에 없는 해는 주말만 쉬는 것으로
// 보고 계산한다(= 공휴일에도 발송될 수 있다).
export const KOREAN_HOLIDAYS = [
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", "2026-03-02", // 삼일절 및 대체공휴일
  "2026-05-05", // 어린이날
  "2026-05-24", "2026-05-25", // 부처님오신날 및 대체공휴일
  "2026-06-06", // 현충일
  "2026-08-15", "2026-08-17", // 광복절 및 대체공휴일
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
  "2026-10-03", // 개천절
  "2026-10-09", // 한글날
  "2026-12-25", // 기독탄신일(크리스마스)
];

const KOREAN_HOLIDAY_SET = new Set(KOREAN_HOLIDAYS);

/** 그 시각이 속한 한국 날짜(YYYY-MM-DD). */
export function getKstDateString(value: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(value);
}

/** 한국 날짜 문자열에 날짜를 더한다. */
export function addKstDays(dateString: string, days: number): string {
  const anchor = new Date(`${dateString}T00:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** 한국 날짜 문자열이 주말이거나 공휴일인가. */
export function isKstHolidayDate(dateString: string): boolean {
  if (KOREAN_HOLIDAY_SET.has(dateString)) return true;

  const weekday = new Date(`${dateString}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** 그 시각의 한국 날짜가 영업일인가. 자동 발송은 영업일에만 나간다. */
export function isKstBusinessDay(value: Date): boolean {
  return !isKstHolidayDate(getKstDateString(value));
}

/**
 * 확정일 다음 날부터 오늘까지 센 영업일이 목표치에 닿았는가.
 * 확정일 당일은 세지 않고, 오늘은 센다(기존 판정과 같은 셈법).
 */
export function hasPassedKstBusinessDays(
  confirmedAt: Date,
  targetBusinessDays: number,
  now: Date = new Date(),
): boolean {
  const start = getKstDateString(confirmedAt);
  const today = getKstDateString(now);

  if (start >= today) return false;

  let businessDays = 0;
  let cursor = start;

  while (cursor < today) {
    cursor = addKstDays(cursor, 1);
    if (!isKstHolidayDate(cursor)) {
      businessDays++;
      if (businessDays >= targetBusinessDays) return true;
    }
  }

  return businessDays >= targetBusinessDays;
}
