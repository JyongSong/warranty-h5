import { sendCafe24Sms } from "@/lib/cafe24";

type SmsProvider = "mock" | "twilio" | "internal" | "cafe24";

const PROVIDER = (process.env.SMS_PROVIDER as SmsProvider) || "mock";

export async function sendSms(toE164: string, text: string) {
  if (PROVIDER === "mock") {
    console.log("[SMS MOCK] to:", toE164, "text:", text);
    return { ok: true };
  }

  if (PROVIDER === "twilio") {
    // 你接 Twilio 才用（下面会告诉你要哪些 env）
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
      throw new Error("TWILIO_ENV_MISSING");
    }
    const twilio = (await import("twilio")).default;
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_FROM, to: toE164, body: text });
    return { ok: true };
  }

  if (PROVIDER === "internal") {
    // 你们如果有内部短信网关，改这里：fetch 内部API
    // 示例（伪代码）：
    // await fetch(process.env.INTERNAL_SMS_ENDPOINT!, { method:"POST", headers:{...}, body: JSON.stringify({to:toE164, text}) })
    throw new Error("INTERNAL_PROVIDER_NOT_IMPLEMENTED");
  }

  if (PROVIDER === "cafe24") {
    const digits = toE164.replace(/[^\d]/g, "");
    await sendCafe24Sms(digits, text);
    return { ok: true };
  }

  throw new Error("UNKNOWN_SMS_PROVIDER");
}
