import { NextResponse } from "next/server";
import crypto from "crypto";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { CONFIRM_TOKEN_TTL_MS } from "@/lib/confirmToken";
import { buildInstallerConfirmSms } from "@/lib/installerSms";
import { sendSms } from "@/lib/sms";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();

    if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

    // 1) 先查记录
    const rec = await prisma.warrantyRegistration.findUnique({
      where: { id },
      select: {
        id: true,
        sn: true,
        installerPhone: true,
        status: true,
      },
    });

    if (!rec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    if (rec.status === "confirmed") {
      return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
    }
    if (rec.status === "void") {
      return NextResponse.json({ error: "VOID_RECORD" }, { status: 400 });
    }
    if (!rec.installerPhone) {
      return NextResponse.json({ error: "INSTALLER_PHONE_MISSING" }, { status: 400 });
    }

    // 2) 生成新 token（24h）
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS);

    // 3) 更新 token
    await prisma.warrantyRegistration.update({
      where: { id },
      data: {
        confirmToken: token,
        confirmTokenExpiresAt: expiresAt,
      },
    });

    const confirmLink = `${getBaseUrl()}/confirm?t=${encodeURIComponent(token)}`;
    const installerSmsObj = buildInstallerConfirmSms({ confirmLink });

    await sendSms(rec.installerPhone, installerSmsObj.text, installerSmsObj.subject, {
      alimtalk: installerSmsObj.alimtalk,
    });

    console.log("[SMS SENT][RESEND] to:", rec.installerPhone, "link:", confirmLink);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
