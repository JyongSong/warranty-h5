import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { buildUserCompletionSms } from "@/lib/userSms";

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
        userPhone: true,
        freeAsEndDate: true,
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

    // 인증 기사 + confirm 완료 → 사용자에게 완료 SMS (기사 연락처 포함).
    // 트랜잭션 외부에서 발송 (SMS 실패 시 DB 롤백 방지, sms.ts 는 silent failure).
    if (
      rec.installType === "installer" &&
      rec.userPhone &&
      rec.freeAsEndDate
    ) {
      const userSmsObj = buildUserCompletionSms({
        installType: "installer",
        freeAsEndDate: rec.freeAsEndDate,
        installerPhone: rec.installerPhone,
      });
      await sendSms(rec.userPhone, userSmsObj.text, userSmsObj.subject, {
        alimtalk: userSmsObj.alimtalk,
      });
      console.log("[SMS SENT][CONFIRM→USER]", { to: rec.userPhone });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
