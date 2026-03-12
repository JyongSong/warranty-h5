import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { parseInstallerPayload } from "@/lib/installer";
import { mysqlPool } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

type Context = {
  params: Promise<{ id: string }>;
};

type InstallerRow = RowDataPacket & {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  coverage: string | null;
  address: string | null;
  category: string | null;
  ability: string | null;
  installCount: number | null;
  happyCallLt: number | null;
  defectCount: number | null;
  dissatisfactionNote: string | null;
  updatedAt: string;
};

const installerSelect = `
  SELECT
    id,
    name,
    phone,
    branch,
    region,
    coverage,
    address,
    category,
    ability,
    install_count AS installCount,
    happy_call_lt AS happyCallLt,
    defect_count AS defectCount,
    dissatisfaction_note AS dissatisfactionNote,
    updated_at AS updatedAt
  FROM installers
`;

export async function PATCH(req: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const data = parseInstallerPayload(body);

    await mysqlPool.execute<ResultSetHeader>(
      `UPDATE installers
       SET
         name = ?,
         phone = ?,
         branch = ?,
         region = ?,
         coverage = ?,
         address = ?,
         category = ?,
         ability = ?,
         install_count = ?,
         happy_call_lt = ?,
         defect_count = ?,
         dissatisfaction_note = ?,
         updated_at = NOW(3)
       WHERE id = ?`,
      [
        data.name,
        data.phone,
        data.branch,
        data.region,
        data.coverage,
        data.address,
        data.category,
        data.ability,
        data.installCount,
        data.happyCallLt,
        data.defectCount,
        data.dissatisfactionNote,
        id,
      ]
    );

    const [rows] = await mysqlPool.execute<InstallerRow[]>(
      `${installerSelect} WHERE id = ? LIMIT 1`,
      [id]
    );

    return NextResponse.json({ ok: true, item: rows[0] ?? null });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: Request, context: Context) {
  try {
    const { id } = await context.params;

    await mysqlPool.execute<ResultSetHeader>("DELETE FROM installers WHERE id = ?", [id]);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}
