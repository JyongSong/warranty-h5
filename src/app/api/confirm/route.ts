import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();

    if (token.length < 10) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });

    // 1) 查记录
    const rec = await prisma.warrantyRegistration.findFirst({
      where: { confirmToken: token },
      select: {
        id: true,
        status: true,
        confirmTokenExpiresAt: true,
        installType: true,
        installerPhone: true,
      },
    });

    if (!rec) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 400 });

    if (rec.status === "confirmed") return NextResponse.json({ ok: true, already: true });
    if (rec.status === "void"){
        return NextResponse.json({ error: "VOID_RECORD"}, { status: 400 });
    }

    const exp = rec.confirmTokenExpiresAt ? rec.confirmTokenExpiresAt.getTime() : 0;
    if (Date.now() > exp) return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.warrantyRegistration.update({
        where: { id: rec.id },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: "sms_link",
          confirmToken: null,
          confirmTokenExpiresAt: null,
        },
      });

      if (rec.installType === "installer" && rec.installerPhone) {
        const installer = await tx.installer.findUnique({
          where: { phone: rec.installerPhone },
          select: { id: true, installCount: true },
        });

        if (installer) {
          await tx.installer.update({
            where: { id: installer.id },
            data: {
              installCount: (installer.installCount ?? 0) + 1,
            },
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
