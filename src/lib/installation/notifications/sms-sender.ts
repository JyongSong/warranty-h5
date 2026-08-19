import { SolapiMessageService } from "solapi";
import { SYSTEM_SETTING_KEYS, getSystemSettingValue } from "@/lib/backoffice/system-settings";
import { type AlimtalkRequest } from "@/lib/notifications/alimtalk";
import { resolveAlimtalkKakaoOptions } from "@/lib/notifications/alimtalk-options";

let _service: SolapiMessageService | null = null;

function getSolapiMessageService(): SolapiMessageService | null {
  if (_service) return _service;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  _service = new SolapiMessageService(apiKey, apiSecret);
  return _service;
}

function normalizeKoreanPhoneNumber(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("82")) return `0${digits.slice(2)}`;
  return digits;
}

function parseRecipientPhoneNumbers(input: string): string[] {
  return input
    .split(/[,\n;]/)
    .map((value) => normalizeKoreanPhoneNumber(value))
    .filter((value) => value !== "");
}

export type InstallationSmsDeliveryReport = {
  messageId: string;
  status: string | null;
  statusCode: string | null;
  reason: string | null;
  dateReported: string | null;
};

export type SendInstallationSmsOptions = {
  /**
   * 알림톡 템플릿과 변수. 알림톡이 꺼져 있거나 변수 검증에 실패하면 SMS 로만
   * 발송한다. outbox 재시도/회신 처리 로직은 그대로 쓴다.
   */
  alimtalk?: AlimtalkRequest;
};

export async function sendInstallationSmsOrThrow(
  to: string | null | undefined,
  text: string,
  options?: SendInstallationSmsOptions
): Promise<{ providerMessageId: string | null }> {
  const deliveryMode = await getSystemSettingValue(SYSTEM_SETTING_KEYS.installationSmsDeliveryMode);
  if (!deliveryMode || deliveryMode === "disabled") {
    throw new Error("SMS_DISABLED_BY_SYSTEM_SETTING");
  }

  let recipient: string | null = to ?? null;
  if (deliveryMode === "test") {
    recipient = await getSystemSettingValue(SYSTEM_SETTING_KEYS.installationSmsTestPhoneNumber);
  } else if (deliveryMode !== "production") {
    throw new Error("SMS_DELIVERY_MODE_INVALID");
  }

  if (!recipient || recipient === "false" || recipient.trim() === "") {
    throw new Error("SMS_RECIPIENT_PHONE_INVALID");
  }

  const recipients = parseRecipientPhoneNumbers(recipient);
  if (recipients.length === 0) throw new Error("SMS_RECIPIENT_PHONE_INVALID");

  const from = process.env.SOLAPI_SENDER;
  if (!from) throw new Error("SOLAPI_SENDER_MISSING");

  const service = getSolapiMessageService();
  if (!service) throw new Error("SOLAPI_CREDENTIALS_MISSING");

  // 설정 조회 오류는 삼키지 않는다 (outbox 가 재시도하도록).
  const kakaoOptions = options?.alimtalk
    ? await resolveAlimtalkKakaoOptions(options.alimtalk)
    : null;

  let providerMessageId: string | null = null;

  for (const normalized of recipients) {
    const response = await service.send(
      kakaoOptions
        ? { to: normalized, from, text, kakaoOptions }
        : { to: normalized, from, text },
      { showMessageList: true }
    ) as {
      groupInfo?: { groupId?: string };
      messageList?: Array<{ messageId?: string }>;
    };

    providerMessageId ??=
      response.messageList?.[0]?.messageId ?? response.groupInfo?.groupId ?? null;
  }

  return {
    providerMessageId,
  };
}

export async function getInstallationSmsDeliveryReport(
  messageId: string,
): Promise<InstallationSmsDeliveryReport | null> {
  const service = getSolapiMessageService();
  if (!service) throw new Error("SOLAPI_CREDENTIALS_MISSING");

  const response = await service.getMessages({ messageId });
  const messages = Object.values(response.messageList ?? {}) as Array<{
    messageId?: string;
    status?: string | null;
    statusCode?: string | null;
    reason?: string | null;
    dateReported?: string | null;
  }>;
  const message = messages.find((item) => item.messageId === messageId) ?? messages[0];
  if (!message) return null;

  return {
    messageId: message.messageId ?? messageId,
    status: message.status ?? null,
    statusCode: message.statusCode ?? null,
    reason: message.reason ?? null,
    dateReported: message.dateReported ?? null,
  };
}
