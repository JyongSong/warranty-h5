import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { parseInstallerPayload } from "@/lib/installer";
import { mysqlPool } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("query") ?? "").trim();
    const phone = normalizePhone(query);
    const values: unknown[] = [];
    let sql = installerSelect;

    if (query.length >= 2 || phone.length >= 2) {
      sql += `
        WHERE
          name LIKE ?
          OR phone LIKE ?
          OR branch LIKE ?
          OR region LIKE ?
          OR coverage LIKE ?
          OR category LIKE ?
          OR ability LIKE ?
          OR address LIKE ?
          OR dissatisfaction_note LIKE ?
      `;

      const like = `%${query}%`;
      const phoneLike = `%${phone || query}%`;
      values.push(like, phoneLike, like, like, like, like, like, like, like);
    }

    sql += ` ORDER BY updated_at DESC, name ASC LIMIT ${
      query.length < 2 && phone.length < 2 ? 100 : 20
    }`;

    const [rows] = await mysqlPool.execute<InstallerRow[]>(sql, values);

    return NextResponse.json({ items: rows });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = parseInstallerPayload(body);

    await mysqlPool.execute<ResultSetHeader>(
      `INSERT INTO installers
        (id, name, phone, branch, region, coverage, address, category, ability, install_count, happy_call_lt, defect_count, dissatisfaction_note, created_at, updated_at)
      VALUES
        (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
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
      ]
    );

    const [fallbackRows] = await mysqlPool.execute<InstallerRow[]>(
      `${installerSelect} WHERE phone = ? LIMIT 1`,
      [data.phone]
    );

    return NextResponse.json({ ok: true, item: fallbackRows[0] ?? null });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}
