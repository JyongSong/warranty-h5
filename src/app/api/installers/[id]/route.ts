import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { parseInstallerPatch } from "@/lib/installer";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: Context) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const { id } = await context.params;
    const body = await req.json();
    // 보낸 항목만 바꾼다. 폼에 없는 항목이 기본값으로 덮이면 안 된다.
    const data = parseInstallerPatch(body);

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
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

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
