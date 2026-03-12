import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { parseInstallerPayload } from "@/lib/installer";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("query") ?? "").trim();
    const phone = normalizePhone(query);
    const filters =
      query.length >= 2 || phone.length >= 2
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: phone || query } },
              { branch: { contains: query, mode: "insensitive" as const } },
              { region: { contains: query, mode: "insensitive" as const } },
              { coverage: { contains: query, mode: "insensitive" as const } },
              { category: { contains: query, mode: "insensitive" as const } },
              { ability: { contains: query, mode: "insensitive" as const } },
              { address: { contains: query, mode: "insensitive" as const } },
              { dissatisfactionNote: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : undefined;

    const rows = await prisma.installer.findMany({
      where: filters,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: query.length < 2 && phone.length < 2 ? 100 : 20,
    });

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

    const item = await prisma.installer.create({
      data,
    });

    return NextResponse.json({ ok: true, item });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}
