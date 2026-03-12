import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";

function maskSn(sn: string) {
  if (!sn) return "";
  if (sn.length <= 6) return sn;
  return sn.slice(0, 6) + "****" + sn.slice(-4);
}

function maskPhone(phone: string) {
  const p = (phone ?? "").replace(/[^\d]/g, "");
  if (p.length < 4) return "****";
  return "****" + p.slice(-4);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = (searchParams.get("t") ?? "").trim();

    if (token.length < 10) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
    }

    const rec = await prisma.warrantyRegistration.findFirst({
      where: { confirmToken: token },
      select: {
        sn: true,
        installDate: true,
        userPhone: true,
        status: true,
        confirmTokenExpiresAt: true,
        confirmedAt: true,
      },
    });

    if (!rec) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });

    // token 过期也要能展示信息，但前端会提示不可确认
    const exp = rec.confirmTokenExpiresAt ? rec.confirmTokenExpiresAt.getTime() : 0;

    return NextResponse.json({
      ok: true,
      data: {
        snMasked: maskSn(rec.sn),
        installDate: rec.installDate,
        userPhoneMasked: maskPhone(rec.userPhone),
        status: rec.status,
        tokenExpired: exp > 0 ? Date.now() > exp : false,
        confirmedAt: rec.confirmedAt,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
