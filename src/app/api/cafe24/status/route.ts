import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getCafe24Status } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

export async function GET() {
  try {
    const { errorResponse } = await requireAdminApi();
    if (errorResponse) return errorResponse;

    const status = await getCafe24Status();
    return NextResponse.json(status);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "CAFE24_STATUS_FAILED") },
      { status: 500 }
    );
  }
}
