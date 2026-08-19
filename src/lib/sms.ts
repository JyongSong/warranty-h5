import { SolapiMessageService } from "solapi";
import {
  AlimtalkTemplateError,
  buildAlimtalkKakaoOptions,
  getAlimtalkPfId,
  type AlimtalkRequest,
} from "@/lib/notifications/alimtalk";
import {
  SYSTEM_SETTING_KEYS,
  isSystemSettingEnabled,
} from "@/lib/backoffice/system-settings";

let _service: SolapiMessageService | null = null;

function getService(): SolapiMessageService | null {
  if (_service) return _service;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  _service = new SolapiMessageService(apiKey, apiSecret);
  return _service;
}

// Solapi 는 한국 로컬 번호 (01012345678) 를 요구한다.
// 입력이 +8210... / 8210... 이어도 모두 0 으로 시작하는 로컬 번호로 정규화한다.
function normalizeKr(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

export type SendSmsOptions = {
  /**
   * 알림톡으로 보낼 템플릿과 변수. 알림톡이 꺼져 있거나 템플릿 변수 검증에
   * 실패하면 조용히 SMS 로만 발송한다 (등록 플로우를 막지 않기 위해).
   */
  alimtalk?: AlimtalkRequest;
};

/**
 * 알림톡 발송 가능 여부. 시스템 설정 스위치와 pfId 환경변수가 모두 있어야 한다.
 * 설정 조회가 실패해도 SMS 발송은 계속되어야 하므로 오류를 삼킨다.
 */
async function isAlimtalkEnabled(): Promise<boolean> {
  if (!getAlimtalkPfId()) return false;
  try {
    return await isSystemSettingEnabled(SYSTEM_SETTING_KEYS.notificationsAlimtalkEnabled);
  } catch (e) {
    console.error("[ALIMTALK] 설정 조회 실패, SMS 로 폴백:", e);
    return false;
  }
}

export async function sendSms(
  to: string | null | undefined,
  text: string,
  subject?: string,
  options?: SendSmsOptions
): Promise<void> {
  if (!to) return;
  const from = process.env.SOLAPI_SENDER;
  if (!from) return;

  const service = getService();
  if (!service) return;

  const normalized = normalizeKr(to);
  if (!normalized) return;

  const kakaoOptions = options?.alimtalk
    ? await resolveKakaoOptions(options.alimtalk)
    : null;

  try {
    // kakaoOptions 가 있으면 알림톡으로 나가고, 카카오 발송이 실패하면
    // disableSms:false 덕분에 아래 text 로 SMS 대체발송된다.
    await service.send(
      kakaoOptions
        ? { to: normalized, from, text, subject, kakaoOptions }
        : { to: normalized, from, text, subject }
    );
  } catch (e) {
    console.error("[SMS] 발송 실패:", e);
  }
}

async function resolveKakaoOptions(request: AlimtalkRequest) {
  if (!(await isAlimtalkEnabled())) return null;

  try {
    return buildAlimtalkKakaoOptions(request);
  } catch (e) {
    if (e instanceof AlimtalkTemplateError) {
      console.error(`[ALIMTALK] ${request.templateKey} 템플릿 오류(${e.code}), SMS 로 폴백:`, e.message);
      return null;
    }
    throw e;
  }
}
