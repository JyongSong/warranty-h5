import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import { krToE164 } from "@/lib/phone";
import { getBaseUrl } from "@/lib/getBaseUrl"


function normalizePhone(s: string) {
    return (s ?? "").replace(/[^\d]/g, "");
}

function addDays(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
    console.log("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
    try {
        const body = await req.json();

        const sn = String(body.sn ?? "").trim();
        const installDate = String(body.installDate ?? "");
        const userPhone = normalizePhone(body.userPhone);
        const installerPhone = normalizePhone(body.installerPhone);
        const consentPrivacy = body.consentPrivacy === true;

        if (!sn || sn.length < 6) return NextResponse.json({ error: "INVALID_SN" }, { status: 400 });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate))
            return NextResponse.json({ error: "INVALID_INSTALL_DATE" }, { status: 400 });

        const today = new Date().toISOString().slice(0, 10);
        if (installDate > today) return NextResponse.json({ error: "INSTALL_DATE_IN_FUTURE" }, { status: 400 });

        if (userPhone.length < 9) return NextResponse.json({ error: "INVALID_USER_PHONE" }, { status: 400 });
        if (installerPhone.length < 9) return NextResponse.json({ error: "INVALID_INSTALLER_PHONE" }, { status: 400 });
        if (!consentPrivacy) return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 400 });

        // 1) SN 必须在出货清单中
        const shipped = await supabaseAdmin
            .from("shipped_devices")
            .select("sn")
            .eq("sn", sn)
            .maybeSingle();

        if (shipped.error) return NextResponse.json({ error: shipped.error.message }, { status: 500 });
        if (!shipped.data) return NextResponse.json({ error: "SN_NOT_FOUND" }, { status: 400 });

        // 2) 生成确认 token（72小时）
        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
        const freeEnd = addDays(installDate, 365);

        // 3) 入库
        // 先看该 SN 是否已有 confirmed（若有直接拒绝）
        const confirmed = await supabaseAdmin
            .from("warranty_registrations")
            .select("id")
            .eq("sn", sn)
            .eq("status", "confirmed")
            .limit(1);

        if (confirmed.error) return NextResponse.json({ error: confirmed.error.message }, { status: 500 });
        if (confirmed.data && confirmed.data.length > 0) {
            return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
        }
        // 查是否已有 submitted（如果有就更新这条；没有才插入）
        const existing = await supabaseAdmin
            .from("warranty_registrations")
            .select("id")
            .eq("sn", sn)
            .eq("status", "submitted")
            .order("submitted_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });

        let regId: string;

        if (existing.data) {
            // UPDATE：重发 token + 更新安装/手机号信息
            const upd = await supabaseAdmin
                .from("warranty_registrations")
                .update({
                    install_date: installDate,
                    user_phone: userPhone,
                    installer_phone: installerPhone,
                    consent_privacy: true,
                    confirm_token: token,
                    confirm_token_expires_at: expiresAt,
                    free_as_end_date: freeEnd,
                    submitted_at: new Date().toISOString(), // 可选：刷新提交时间，便于排序
                    status: "submitted",
                })
                .eq("id", existing.data.id)
                .select("id")
                .single();

            if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
            regId = upd.data.id;
        } else {
            // INSERT：首次提交
            const ins = await supabaseAdmin
                .from("warranty_registrations")
                .insert({
                    sn,
                    install_date: installDate,
                    user_phone: userPhone,
                    installer_phone: installerPhone,
                    consent_privacy: true,
                    confirm_token: token,
                    confirm_token_expires_at: expiresAt,
                    free_as_end_date: freeEnd,
                    status: "submitted",
                })
                .select("id")
                .single();

            if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
            regId = ins.data.id;
        }

        // 4) 生成确认链接（短信以后接真实通道）
        const confirmLink = `${getBaseUrl()}/confirm?t=${encodeURIComponent(token)}`;

        const smsText = `[Aqara] 설치 완료 확인 링크입니다.\n${confirmLink}`;
        await sendSms(krToE164(installerPhone), smsText);

        console.log("[SMS MOCK] to:", installerPhone, "link:", confirmLink);

        return NextResponse.json({ ok: true, id: regId, confirmLink });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "UNKNOWN_ERROR" }, { status: 500 });
    }
}