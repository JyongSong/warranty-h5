import { NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { smsStore } from "@/lib/store/smsStore";

export async function POST(request: Request) {
  try {
    const { action, phone, code } = await request.json();
    
    if (!phone) {
      return NextResponse.json({ error: "전화번호가 필요합니다." }, { status: 400 });
    }
    
    const normalized = normalizePhone(phone);
    if (normalized.length < 9) {
      return NextResponse.json({ error: "올바른 전화번호를 입력해 주세요." }, { status: 400 });
    }

    if (action === "send") {
      // 1. Generate 6-digit random code
      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 2. Set expiration (3 minutes from now)
      const expiresAt = Date.now() + 3 * 60 * 1000;
      smsStore.set(normalized, { code: generatedCode, expiresAt });
      
      // 3. Send SMS using solapi
      const smsText = `[아카라 라이프] 본인확인 인증번호 [${generatedCode}]를 입력해 주세요. (3분 이내)`;
      await sendSms(normalized, smsText);

      // FOR DEVELOPMENT / LOCAL TESTING: also print code to console so we can see it
      console.log(`[SMS Verification] Phone: ${normalized}, Code: ${generatedCode}`);

      return NextResponse.json({ success: true, message: "인증번호가 발송되었습니다." });
    }
    
    if (action === "verify") {
      if (!code) {
        return NextResponse.json({ error: "인증번호를 입력해 주세요." }, { status: 400 });
      }

      const stored = smsStore.get(normalized);
      if (!stored) {
        return NextResponse.json({ error: "발송된 인증번호가 없거나 만료되었습니다." }, { status: 400 });
      }

      if (Date.now() > stored.expiresAt) {
        smsStore.delete(normalized);
        return NextResponse.json({ error: "인증시간이 만료되었습니다. 다시 시도해 주세요." }, { status: 400 });
      }

      if (stored.code !== code.trim()) {
        return NextResponse.json({ error: "인증번호가 일치하지 않습니다." }, { status: 400 });
      }

      // Valid code, clear store
      smsStore.delete(normalized);
      return NextResponse.json({ success: true, message: "인증되었습니다." });
    }

    return NextResponse.json({ error: "올바르지 않은 요청입니다." }, { status: 400 });
  } catch (error: unknown) {
    console.error("[SMS API] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
