import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getCafe24SmsSetting } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

export async function GET() {
  try {
    const { errorResponse } = await requireAdminApi();
    if (errorResponse) return errorResponse;

    const setting = await getCafe24SmsSetting();
    return NextResponse.json(setting);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "CAFE24_SMS_SETTING_FAILED") },
      { status: 500 }
    );
  }
}
