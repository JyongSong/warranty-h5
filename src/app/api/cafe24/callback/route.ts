import { NextResponse } from "next/server";
import { exchangeCafe24Code, verifyCafe24State } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") ?? "").trim();
    const state = searchParams.get("state");

    if (!code) {
      return NextResponse.redirect("/auth?error=cafe24_callback");
    }

    const payload = verifyCafe24State(state);
    await exchangeCafe24Code(code);

    return NextResponse.redirect(`${payload.returnTo}?connected=cafe24`);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "CAFE24_CALLBACK_FAILED") },
      { status: 500 }
    );
  }
}
