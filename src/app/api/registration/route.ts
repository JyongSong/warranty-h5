import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; 

function maskSn(sn: string) {
  if (!sn) return "";
  if (sn.length <= 6) return sn;
  return sn.slice(0, 6) + "****" + sn.slice(-4);
}

function maskPhone(phone: string) {
  const p = (phone ?? "").replace(/[^\d]/g, "");
  if (p.length < 4) return "****";
  return "****" + p.slice(-4);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = (searchParams.get("t") ?? "").trim();

    if (token.length < 10) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
    }

    const rec = await supabaseAdmin
      .from("warranty_registrations")
      .select("sn, install_date, user_phone, status, confirm_token_expires_at, confirmed_at")
      .eq("confirm_token", token)
      .maybeSingle();

    if (rec.error) return NextResponse.json({ error: rec.error.message }, { status: 500 });
    if (!rec.data) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });

    // token 过期也要能展示信息，但前端会提示不可确认
    const exp = rec.data.confirm_token_expires_at
      ? new Date(rec.data.confirm_token_expires_at).getTime()
      : 0;

    return NextResponse.json({
      ok: true,
      data: {
        snMasked: maskSn(rec.data.sn),
        installDate: rec.data.install_date,
        userPhoneMasked: maskPhone(rec.data.user_phone),
        status: rec.data.status,
        tokenExpired: exp > 0 ? Date.now() > exp : false,
        confirmedAt: rec.data.confirmed_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "UNKNOWN_ERROR" }, { status: 500 });
  }
}