import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // 用 service role 读数据（server only）
);

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("t")?.trim();

    if (!token) {
        return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("warranty_registrations")
        .select(
            "id,sn,install_date,user_phone,installer_phone,status,confirm_token_expires_at,submitted_at"
        )
        .eq("confirm_token", token)
        .maybeSingle();

    if (error) {
        console.error("[confirm/info] supabase error:", error);
        return NextResponse.json(
            { error: "DB_ERROR", detail: error.message },
            { status: 500 }
        );
    }
    if (!data) {
        return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });
    }

    const tokenExpired =
        data.confirm_token_expires_at && new Date(data.confirm_token_expires_at).getTime() < Date.now();

    return NextResponse.json({
        id: data.id,
        sn: data.sn,
        installDate: data.install_date,
        userPhone: data.user_phone,
        installerPhone: data.installer_phone,
        status: data.status,
        tokenExpired,
        createdAt: data.submitted_at,
    });
}