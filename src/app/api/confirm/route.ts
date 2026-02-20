import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();

    if (token.length < 10) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });

    // 1) 查记录
    const rec = await supabaseAdmin
      .from("warranty_registrations")
      .select("id, status, confirm_token_expires_at")
      .eq("confirm_token", token)
      .maybeSingle();

    if (rec.error) return NextResponse.json({ error: rec.error.message }, { status: 500 });
    if (!rec.data) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 400 });

    if (rec.data.status === "confirmed") return NextResponse.json({ ok: true, already: true });
    if (rec.data.status === "void"){
        return NextResponse.json({ error: "VOID_RECORD"}, { status: 400 });
    }

    const exp = rec.data.confirm_token_expires_at ? new Date(rec.data.confirm_token_expires_at).getTime() : 0;
    if (Date.now() > exp) return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 400 });

    // 2) 更新为 confirmed
    const upd = await supabaseAdmin
      .from("warranty_registrations")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: "sms_link",
        confirm_token: null,
        confirm_token_expires_at: null,
      })
      .eq("id", rec.data.id);

    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "UNKNOWN_ERROR" }, { status: 500 });
  }
}