/**
 * 기사 배정 응답 타임라인.
 *
 * 배정 요청 발송 → INSTALLER_RESPONSE_TIMEOUT_HOURS 무응답 시 자동 타임아웃
 * → 다음 후보 기사에게 재배정.
 *
 * 카카오 알림톡 "설치 배정 요청" 문안에 이 시간이 명시되므로 바꾸려면
 * 템플릿도 함께 재심사해야 한다.
 */
export const INSTALLER_RESPONSE_TIMEOUT_HOURS = 24;
