import { NextResponse } from "next/server";
import { type SupabaseCookieToSet, signInBackofficeWithPassword } from "@/lib/login/backofficeAuth";
import { getErrorMessage } from "@/lib/error";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "");
    const password = String(body?.password ?? "");
    const cookiesToSet: SupabaseCookieToSet[] = [];

    const user = await signInBackofficeWithPassword(email, password, cookiesToSet);
    const response = NextResponse.json({
      ok: true,
      user: {
        email: user.email,
        level: user.level,
      },
    });

    for (const cookie of cookiesToSet) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "AUTH_FAILED") },
      { status: 401 },
    );
  }
}
