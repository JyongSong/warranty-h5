import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // 若没用 alias，改成你的相对路径

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();

    if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

    // 1) 先查记录
    const rec = await supabaseAdmin
      .from("warranty_registrations")
      .select("id, sn, installer_phone, status")
      .eq("id", id)
      .maybeSingle();

    if (rec.error) return NextResponse.json({ error: rec.error.message }, { status: 500 });
    if (!rec.data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    if (rec.data.status === "confirmed") {
      return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
    }
    if (rec.data.status === "void") {
      return NextResponse.json({ error: "VOID_RECORD" }, { status: 400 });
    }

    // 2) 生成新 token（72h）
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    // 3) 更新 token
    const upd = await supabaseAdmin
      .from("warranty_registrations")
      .update({
        confirm_token: token,
        confirm_token_expires_at: expiresAt,
      })
      .eq("id", id);

    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });

    // 4) 生成确认链接（短信后续接）
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const confirmLink = `${baseUrl}/confirm?t=${token}`;

    console.log("[SMS MOCK][RESEND] to:", rec.data.installer_phone, "link:", confirmLink);

    return NextResponse.json({ ok: true, confirmLink });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "UNKNOWN_ERROR" }, { status: 500 });
  }
}