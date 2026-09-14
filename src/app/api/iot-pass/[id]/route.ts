import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { parseIotPassPatch, serializeIotPass } from "@/lib/iotPass";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

function isUniqueSnError(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export async function PATCH(req: Request, context: Context) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const { id } = await context.params;
    const body = await req.json();
    // 보낸 항목만 바꾼다. 폼에 없는 항목이 기본값으로 덮이면 안 된다.
    const data = parseIotPassPatch(body);

    const item = await prisma.device_feature_upgrades.update({ where: { id }, data });

    return NextResponse.json({ ok: true, item: serializeIotPass(item, null) });
  } catch (error: unknown) {
    if (isUniqueSnError(error)) {
      return NextResponse.json({ error: "이미 등록된 SN 입니다." }, { status: 409 });
    }
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 400 });
  }
}

export async function DELETE(_req: Request, context: Context) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const { id } = await context.params;

    await prisma.device_feature_upgrades.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 400 });
  }
}
