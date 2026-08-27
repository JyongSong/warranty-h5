import { NextResponse } from "next/server";
import {
  CustomerOtpError,
  getCustomerOtpErrorMessage,
  sendCustomerOtp,
  verifyCustomerOtp,
} from "@/lib/installation/cj/otp";

// 공개 엔드포인트. 레이트 리밋은 lib/installation/cj/otp.ts 안에서 번호 단위로
// 건다(시간당 발송 수 + 재발송 쿨다운 + 검증 시도 횟수).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { action?: string; phone?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", message: "잘못된 요청입니다." }, { status: 400 });
  }

  const phone = body.phone?.trim() ?? "";
  if (!phone) {
    return NextResponse.json(
      { error: "INVALID_PHONE", message: getCustomerOtpErrorMessage("INVALID_PHONE") },
      { status: 400 },
    );
  }

  try {
    if (body.action === "send") {
      await sendCustomerOtp(phone);
      return NextResponse.json({ ok: true, message: "인증번호가 발송되었습니다." });
    }

    if (body.action === "verify") {
      const { verifiedToken } = await verifyCustomerOtp(phone, body.code ?? "");
      return NextResponse.json({ ok: true, verifiedToken, message: "인증되었습니다." });
    }

    return NextResponse.json({ error: "INVALID_ACTION", message: "잘못된 요청입니다." }, { status: 400 });
  } catch (error) {
    if (error instanceof CustomerOtpError) {
      return NextResponse.json(
        { error: error.message, message: getCustomerOtpErrorMessage(error.message) },
        { status: 400 },
      );
    }

    console.error("[api/installation/cj/otp]", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
