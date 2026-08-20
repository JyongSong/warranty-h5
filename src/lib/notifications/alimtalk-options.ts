/**
 * 알림톡 발송 게이트.
 *
 * 레지스트리(alimtalk.ts)는 순수 함수만 두고, 시스템 설정 조회가 필요한
 * 부분만 여기로 분리한다.
 *
 * 발송 경로가 세 곳이라 (레거시 sms.ts / outbox sms-sender.ts / 엑셀 일괄
 * send-assignment-sms) 게이트 판정을 한 곳에 모아 둔다.
 */
import {
  SYSTEM_SETTING_KEYS,
  isSystemSettingEnabled,
} from "@/lib/backoffice/system-settings";
import {
  AlimtalkTemplateError,
  buildAlimtalkKakaoOptions,
  getAlimtalkPfId,
  type AlimtalkKakaoOptions,
  type AlimtalkRequest,
} from "@/lib/notifications/alimtalk";

/**
 * 알림톡 발송 가능 여부. pfId 환경변수와 시스템 설정 스위치가 모두 있어야 한다.
 * 일괄 발송처럼 수백 건을 도는 경로에서는 루프 밖에서 한 번만 호출한다.
 */
export async function isAlimtalkEnabled(): Promise<boolean> {
  if (!getAlimtalkPfId()) return false;
  return isSystemSettingEnabled(SYSTEM_SETTING_KEYS.notificationsAlimtalkEnabled);
}

/**
 * 템플릿 변수 검증 실패를 발송 실패로 만들지 않고 SMS 폴백으로 흘린다.
 * (변수 하나가 비어서 등록/배정 플로우 전체가 막히면 안 된다)
 */
export function buildAlimtalkKakaoOptionsOrNull(
  request: AlimtalkRequest,
): AlimtalkKakaoOptions | null {
  try {
    return buildAlimtalkKakaoOptions(request);
  } catch (e) {
    if (e instanceof AlimtalkTemplateError) {
      console.error(
        `[ALIMTALK] ${request.templateKey} 템플릿 오류(${e.code}), SMS 로 폴백:`,
        e.message,
      );
      return null;
    }
    throw e;
  }
}

/** 게이트 판정 + 변수 검증을 한 번에. 단건 발송 경로에서 쓴다. */
export async function resolveAlimtalkKakaoOptions(
  request: AlimtalkRequest,
): Promise<AlimtalkKakaoOptions | null> {
  if (!(await isAlimtalkEnabled())) return null;
  return buildAlimtalkKakaoOptionsOrNull(request);
}
