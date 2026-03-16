import { NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";
import { validateInternalApiKey } from "@/lib/cafe24";

export async function POST(req: Request) {
  try {
    const internalKey = req.headers.get("x-internal-key");

    if (!validateInternalApiKey(internalKey)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const to = normalizePhone(String(body?.to ?? ""));
    const text = String(body?.text ?? "").trim();

    if (to.length < 9) {
      return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ error: "TEXT_REQUIRED" }, { status: 400 });
    }

    const normalizedE164 = to.startsWith("82") ? `+${to}` : to.startsWith("0") ? `+82${to.slice(1)}` : `+${to}`;
    await sendSms(normalizedE164, text);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "SMS_SEND_FAILED") },
      { status: 500 }
    );
  }
}
