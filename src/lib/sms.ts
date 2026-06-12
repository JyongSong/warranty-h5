import { SolapiMessageService } from "solapi";

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

export async function sendSms(
  to: string | null | undefined,
  text: string,
  subject?: string
): Promise<void> {
  if (!to) return;
  const from = process.env.SOLAPI_SENDER;
  if (!from) return;

  const service = getService();
  if (!service) return;

  const normalized = normalizeKr(to);
  if (!normalized) return;

  try {
    await service.send({ to: normalized, from, text, subject });
  } catch (e) {
    console.error("[SMS] 발송 실패:", e);
  }
}
