import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { sendCafe24Sms } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

const TEST_PHONE = "01091703550";
const TEST_TEXT = "Test";

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
