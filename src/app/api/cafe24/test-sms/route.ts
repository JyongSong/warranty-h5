import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { sendCafe24Sms } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

const TEST_PHONE = "01091703550";
const TEST_TEXT = `비대면 배송을 위해 위탁장소(스타강남지1택배실 )에 2026-03-17 13:29:09에 배송하였습니다.
고객님의 소중한 상품을 찾아가 주세요.
감사합니다.`;

export async function POST() {
  try {
    const { errorResponse } = await requireAdminApi();
    if (errorResponse) return errorResponse;

    const result = await sendCafe24Sms(TEST_PHONE, TEST_TEXT);
    return NextResponse.json({
      ok: true,
      to: TEST_PHONE,
      text: TEST_TEXT,
      result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "CAFE24_TEST_SMS_FAILED") },
      { status: 500 }
    );
  }
}
