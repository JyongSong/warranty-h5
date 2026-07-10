import { NextResponse } from "next/server";
import { createBackofficeSupabaseClient, type SupabaseCookieToSet } from "@/lib/login/backofficeAuth";

export async function POST() {
  const cookiesToSet: SupabaseCookieToSet[] = [];
  const supabase = await createBackofficeSupabaseClient(cookiesToSet);
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });

  for (const cookie of cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
