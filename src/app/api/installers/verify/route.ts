import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { mysqlPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";

type InstallerRow = RowDataPacket & {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  coverage: string | null;
  category: string | null;
  ability: string | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = normalizePhone(searchParams.get("phone") ?? "");

    if (phone.length < 9) {
      return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
    }

    const [rows] = await mysqlPool.execute<InstallerRow[]>(
      `SELECT id, name, phone, branch, region, coverage, category, ability
       FROM installers
       WHERE phone = ?
       LIMIT 1`,
      [phone]
    );

    const item = rows[0];

    if (!item) {
      return NextResponse.json({ error: "INSTALLER_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 500 }
    );
  }
}
