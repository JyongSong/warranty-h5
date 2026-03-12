import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { parseInstallerPayload } from "@/lib/installer";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const data = parseInstallerPayload(body);

    const item = await prisma.installer.update({
      where: { id },
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

export async function DELETE(_req: Request, context: Context) {
  try {
    const { id } = await context.params;

    await prisma.installer.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}
