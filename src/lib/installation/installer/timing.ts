/**
 * 기사 배정 응답 타임라인.
 *
 * 배정 알림(푸시 또는 문자) 발송 시점부터 시계가 돌아간다.
 *
 *   알림 발송 ─┬─ 앱 푸시 (등록 기기가 있는 기사)
 *              │    └─ INSTALLER_PUSH_SMS_FALLBACK_HOURS 무응답 → 문자 발송
 *              └─ 문자 (등록 기기가 없는 기사)
 *   INSTALLER_RESPONSE_TIMEOUT_HOURS 무응답 → 타임아웃 → 다음 후보 기사
 *
 * 폴백 문자가 나가도 마감 시각은 늘어나지 않는다. 문자 문안이 남은 시간이
 * 아니라 마감 "시각"을 안내하는 이유다.
 */
export const INSTALLER_RESPONSE_TIMEOUT_HOURS = 24;
export const INSTALLER_PUSH_SMS_FALLBACK_HOURS = 5;

export function getInstallerResponseExpiresAt(now: Date) {
  return new Date(now.getTime() + INSTALLER_RESPONSE_TIMEOUT_HOURS * 60 * 60 * 1000);
}

export function getInstallerPushSmsFallbackCutoff(now: Date) {
  return new Date(now.getTime() - INSTALLER_PUSH_SMS_FALLBACK_HOURS * 60 * 60 * 1000);
}

/** 문자/알림톡 문안에 넣을 마감 시각. 예: "8월 21일(금) 14시" */
export function formatInstallerResponseDeadline(deadline: Date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(deadline);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("month")} ${get("day")}일(${get("weekday")}) ${get("hour")}시`;
}
