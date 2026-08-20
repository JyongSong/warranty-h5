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
export const REMINDER_AFTER_HOURS = 24;
export const FALLBACK_AFTER_HOURS = 48;
export const CUSTOMER_REQUEST_TOKEN_TTL_HOURS = REMINDER_AFTER_HOURS;
export const REMINDER_TOKEN_TTL_HOURS = FALLBACK_AFTER_HOURS - REMINDER_AFTER_HOURS;
