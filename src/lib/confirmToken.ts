/**
 * 인증기사 설치확인 링크(confirm token) 유효시간.
 *
 * 카카오 알림톡 템플릿 "설치정보 기사 확인 링크"(KA01TP260707014508159QdT8kNfgqpc)
 * 본문이 "24시간 이내"로 심사 통과되어 있으므로 코드도 24시간으로 맞춘다.
 * 이 값을 바꾸려면 알림톡 템플릿도 함께 재심사해야 한다.
 */
export const CONFIRM_TOKEN_TTL_HOURS = 24;
export const CONFIRM_TOKEN_TTL_MS = CONFIRM_TOKEN_TTL_HOURS * 3600 * 1000;
