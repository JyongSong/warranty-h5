import { NextResponse } from "next/server";
import crypto from "crypto";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { sendSms } from "@/lib/sms";
import { krToE164 } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";
import { mysqlPool } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

type ResendRow = RowDataPacket & {
  id: string;
  sn: string;
  installerPhone: string | null;
  status: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();

    if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

    // 1) 先查记录
    const [rows] = await mysqlPool.execute<ResendRow[]>(
      `SELECT
        id,
        sn,
        installer_phone AS installerPhone,
        status
      FROM warranty_registrations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );
    const rec = rows[0];

    if (!rec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    if (rec.status === "confirmed") {
      return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
    }
    if (rec.status === "void") {
      return NextResponse.json({ error: "VOID_RECORD" }, { status: 400 });
    }
    if (!rec.installerPhone) {
      return NextResponse.json({ error: "INSTALLER_PHONE_MISSING" }, { status: 400 });
    }

    // 2) 生成新 token（72h）
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    // 3) 更新 token
    await mysqlPool.execute<ResultSetHeader>(
      `UPDATE warranty_registrations
       SET
         confirm_token = ?,
         confirm_token_expires_at = ?,
         updated_at = NOW(3)
       WHERE id = ?`,
      [token, expiresAt, id]
    );

    const confirmLink = `${getBaseUrl()}/confirm?t=${encodeURIComponent(token)}`;
    const smsText = `[Aqara] 설치 완료 확인 링크입니다.\n${confirmLink}`;

    await sendSms(krToE164(rec.installerPhone), smsText);

    console.log("[SMS MOCK][RESEND] to:", rec.installerPhone, "link:", confirmLink);

    return NextResponse.json({ ok: true, confirmLink });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
