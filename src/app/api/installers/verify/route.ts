import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = normalizePhone(searchParams.get("phone") ?? "");

    if (phone.length < 9) {
      return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
    }

    const item = await prisma.installer.findUnique({
      where: { phone },
      select: {
        id: true,
        name: true,
        phone: true,
        branch: true,
        region: true,
        coverage: true,
        category: true,
        ability: true,
      },
    });

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
