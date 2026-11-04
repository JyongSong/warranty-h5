import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { recordBackofficeAudit, toBackofficeAuditActor } from "@/lib/backoffice/audit";
import { getErrorMessage } from "@/lib/error";
import { parseInstallerPatch } from "@/lib/installer";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: Context) {
  try {
    const { admin, errorResponse } = await requireAdminApi("edit");
    if (errorResponse) return errorResponse;

    const { id } = await context.params;
    const before = await prisma.installer.findUnique({ where: { id } });
    const body = await req.json();
    // 보낸 항목만 바꾼다. 폼에 없는 항목이 기본값으로 덮이면 안 된다.
    const data = parseInstallerPatch(body);

    const item = await prisma.installer.update({
      where: { id },
      data,
    });
    await recordBackofficeAudit({
      actor: toBackofficeAuditActor(admin),
      entityType: "installer",
      entityId: id,
      entityLabel: item.name,
      action: "update",
      before,
      after: item,
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
    const { admin, errorResponse } = await requireAdminApi("edit");
    if (errorResponse) return errorResponse;

    const { id } = await context.params;

    const deleted = await prisma.installer.delete({ where: { id } });
    await recordBackofficeAudit({
      actor: toBackofficeAuditActor(admin),
      entityType: "installer",
      entityId: id,
      entityLabel: deleted.name,
      action: "delete",
      before: deleted,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}
