import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { createCafe24State, getCafe24AuthorizeUrl } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

export async function GET(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(req.url);
    const nextPath = searchParams.get("next") || "/cafe24";
    const state = searchParams.get("state") ?? createCafe24State(nextPath);

    return NextResponse.redirect(getCafe24AuthorizeUrl(state));
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "CAFE24_AUTHORIZE_FAILED") },
      { status: 500 }
    );
  }
}
