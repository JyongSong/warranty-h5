/**
 * 고객 설치 예약 정보 입력 타임라인.
 *
 * 발송(7번) → REMINDER_AFTER_HOURS 리마인더(9번) → FALLBACK_AFTER_HOURS 폴백
 *
 * FALLBACK_AFTER_HOURS 는 카카오 알림톡 "설치 예약 정보 입력 안내" 템플릿
 * 본문에 시간이 명시돼 있다. 바꾸려면 카카오 템플릿도 함께 재심사해야 한다.
 *
 * 링크 유효시간은 이 타임라인을 이어받도록 맞춘다. 최초 토큰은 리마인더
 * 시점까지, 리마인더가 새로 발급하는 토큰은 폴백 시점까지 살아 있다.
 */
export const REMINDER_AFTER_HOURS = 12;
export const FALLBACK_AFTER_HOURS = 24;

/**
 * 폴백 시점이 주말이면 다음 영업일로 민다. 문안은 "24시간"이라고만 안내하므로,
 * 미루는 방향(고객에게 유리)으로만 어긋나게 한다 — 안내보다 일찍 자동 확정되는
 * 일은 없어야 한다.
 *
 * 금요일 발송이 최대 밀림폭이다(토·일 건너뛰어 월요일 = +48시간).
 */
const MAX_FALLBACK_DEFERRAL_HOURS = 48;

/**
 * 고객 링크 유효시간. 폴백이 밀릴 수 있는 최대치까지 살려 둔다.
 * 시스템이 아직 폴백하지 않았는데 고객 링크만 먼저 만료되면, 눌러도 만료
 * 화면만 보게 된다.
 */
export const CUSTOMER_REQUEST_TOKEN_TTL_HOURS =
  FALLBACK_AFTER_HOURS + MAX_FALLBACK_DEFERRAL_HOURS;
export const REMINDER_TOKEN_TTL_HOURS = CUSTOMER_REQUEST_TOKEN_TTL_HOURS;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function isKstWeekend(instant: Date) {
  const kstDay = new Date(instant.getTime() + KST_OFFSET_MS).getUTCDay();
  return kstDay === 0 || kstDay === 6; // Sun | Sat
}

/**
 * 이 요청이 실제로 폴백되어야 하는 시각.
 *
 * 주말만 건너뛴다. 평일에 걸린 법정공휴일은 반영하지 않는다 — 음력에 걸린
 * 날(설날·추석)까지 다루려면 공휴일 데이터 소스가 필요하다.
 */
export function getCustomerFallbackDueAt(createdAt: Date): Date {
  let due = new Date(createdAt.getTime() + FALLBACK_AFTER_HOURS * 60 * 60 * 1000);
  // 토·일 연속 최대 2일.
  for (let i = 0; i < 2 && isKstWeekend(due); i += 1) {
    due = new Date(due.getTime() + DAY_MS);
  }
  return due;
}

/**
 * 고객이 고를 수 있는 설치 희망일 범위 (KST 오늘 기준).
 * 폼(client)과 서버 검증이 같은 값을 봐야 해서 여기 둔다. 이 파일은 prisma 를
 * 끌어오지 않으므로 클라이언트 번들에 들어가도 안전하다.
 */
export const INSTALL_DATE_MIN_DAYS_AHEAD = 2;
export const INSTALL_DATE_MAX_DAYS_AHEAD = 90;
