import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseInstallerPayload } from "@/lib/installer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = parseInstallerPayload(body);

    const existing = await prisma.installer.findUnique({
      where: { phone: data.phone },
    });

    if (existing) {
      await prisma.installer.update({
        where: { phone: data.phone },
        data,
      });
      return NextResponse.json({ ok: true, updated: true });
    }

    await prisma.installer.create({ data });
    return NextResponse.json({ ok: true, updated: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";

    const status: Record<string, number> = {
      NAME_REQUIRED: 400,
      INVALID_PHONE: 400,
      INVALID_NUMBER_FIELD: 400,
    };

    return NextResponse.json(
      { error: msg },
      { status: status[msg] ?? 500 },
    );
  }
}
