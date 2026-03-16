import { NextResponse } from "next/server";
import { exchangeCafe24Code, verifyCafe24State } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") ?? "").trim();
    const state = searchParams.get("state");

    if (!code) {
      const redirectUrl = new URL("/auth?error=cafe24_callback", requestUrl);
      return NextResponse.redirect(redirectUrl);
    }

    const payload = verifyCafe24State(state);
    await exchangeCafe24Code(code);

    const successUrl = new URL(payload.returnTo, requestUrl);
    successUrl.searchParams.set("connected", "cafe24");
    return NextResponse.redirect(successUrl);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "CAFE24_CALLBACK_FAILED") },
      { status: 500 }
    );
  }
}
