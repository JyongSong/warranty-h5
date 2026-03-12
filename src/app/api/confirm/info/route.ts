import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";

type ConfirmInfoRow = RowDataPacket & {
    id: string;
    sn: string;
    installDate: string;
    userPhone: string;
    installerPhone: string | null;
    status: string;
    confirmTokenExpiresAt: string | null;
    submittedAt: string;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("t")?.trim();

    if (!token) {
        return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
    }

    const [rows] = await mysqlPool.execute<ConfirmInfoRow[]>(
        `SELECT
          id,
          sn,
          install_date AS installDate,
          user_phone AS userPhone,
          installer_phone AS installerPhone,
          status,
          confirm_token_expires_at AS confirmTokenExpiresAt,
          submitted_at AS submittedAt
        FROM warranty_registrations
        WHERE confirm_token = ?
        LIMIT 1`,
        [token]
    );
    const data = rows[0];

    if (!data) {
        return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });
    }

    const tokenExpired =
        data.confirmTokenExpiresAt && new Date(data.confirmTokenExpiresAt).getTime() < Date.now();

    return NextResponse.json({
        id: data.id,
        sn: data.sn,
        installDate: data.installDate,
        userPhone: data.userPhone,
        installerPhone: data.installerPhone,
        status: data.status,
        tokenExpired,
        createdAt: data.submittedAt,
    });
}
