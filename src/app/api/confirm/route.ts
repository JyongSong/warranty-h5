import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { mysqlPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";

type RegistrationRow = RowDataPacket & {
  id: string;
  status: string;
  confirmTokenExpiresAt: string | null;
  installType: string;
  installerPhone: string | null;
};

type InstallerRow = RowDataPacket & {
  id: string;
  installCount: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();

    if (token.length < 10) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });

    // 1) 查记录
    const [rows] = await mysqlPool.execute<RegistrationRow[]>(
      `SELECT
        id,
        status,
        confirm_token_expires_at AS confirmTokenExpiresAt,
        install_type AS installType,
        installer_phone AS installerPhone
      FROM warranty_registrations
      WHERE confirm_token = ?
      LIMIT 1`,
      [token]
    );
    const rec = rows[0];

    if (!rec) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 400 });

    if (rec.status === "confirmed") return NextResponse.json({ ok: true, already: true });
    if (rec.status === "void"){
        return NextResponse.json({ error: "VOID_RECORD"}, { status: 400 });
    }

    const exp = rec.confirmTokenExpiresAt ? new Date(rec.confirmTokenExpiresAt).getTime() : 0;
    if (Date.now() > exp) return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 400 });

    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `UPDATE warranty_registrations
         SET
           status = 'confirmed',
           confirmed_at = NOW(3),
           confirmed_by = 'sms_link',
           confirm_token = NULL,
           confirm_token_expires_at = NULL,
           updated_at = NOW(3)
         WHERE id = ?`,
        [rec.id]
      );

      if (rec.installType === "installer" && rec.installerPhone) {
        const [installerRows] = await conn.execute<InstallerRow[]>(
          "SELECT id, install_count AS installCount FROM installers WHERE phone = ? LIMIT 1",
          [rec.installerPhone]
        );
        const installer = installerRows[0];

        if (installer) {
          await conn.execute(
            "UPDATE installers SET install_count = ?, updated_at = NOW(3) WHERE id = ?",
            [(installer.installCount ?? 0) + 1, installer.id]
          );
        }
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
