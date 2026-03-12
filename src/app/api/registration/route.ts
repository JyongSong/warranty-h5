import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { mysqlPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";

type RegistrationRow = RowDataPacket & {
  sn: string;
  installDate: string;
  userPhone: string;
  status: string;
  confirmTokenExpiresAt: string | null;
  confirmedAt: string | null;
};

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

    const [rows] = await mysqlPool.execute<RegistrationRow[]>(
      `SELECT
        sn,
        install_date AS installDate,
        user_phone AS userPhone,
        status,
        confirm_token_expires_at AS confirmTokenExpiresAt,
        confirmed_at AS confirmedAt
      FROM warranty_registrations
      WHERE confirm_token = ?
      LIMIT 1`,
      [token]
    );
    const rec = rows[0];

    if (!rec) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });

    // token 过期也要能展示信息，但前端会提示不可确认
    const exp = rec.confirmTokenExpiresAt
      ? new Date(rec.confirmTokenExpiresAt).getTime()
      : 0;

    return NextResponse.json({
      ok: true,
      data: {
        snMasked: maskSn(rec.sn),
        installDate: rec.installDate,
        userPhoneMasked: maskPhone(rec.userPhone),
        status: rec.status,
        tokenExpired: exp > 0 ? Date.now() > exp : false,
        confirmedAt: rec.confirmedAt,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
