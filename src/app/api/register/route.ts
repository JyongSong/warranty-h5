import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendSms } from "@/lib/sms";
import { krToE164, normalizePhone } from "@/lib/phone";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";

function addDays(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const sn = String(body.sn ?? "").trim();
        const installType = body.installType === "self" ? "self" : "installer";
        const installDate = String(body.installDate ?? "");
        const userPhone = normalizePhone(body.userPhone);
        const installerPhone = normalizePhone(body.installerPhone);
        const consentPrivacy = body.consentPrivacy === true;

        if (!sn || sn.length < 6) return NextResponse.json({ error: "INVALID_SN" }, { status: 400 });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate))
            return NextResponse.json({ error: "INVALID_INSTALL_DATE" }, { status: 400 });

        const today = new Date().toISOString().slice(0, 10);
        if (installDate > today) return NextResponse.json({ error: "INSTALL_DATE_IN_FUTURE" }, { status: 400 });

        if (userPhone.length < 9) return NextResponse.json({ error: "INVALID_USER_PHONE" }, { status: 400 });
        if (installType === "installer" && installerPhone.length < 9) {
            return NextResponse.json({ error: "INVALID_INSTALLER_PHONE" }, { status: 400 });
        }
        if (!consentPrivacy) return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 400 });

        // 1) SN 必须在出货清单中
        const shipped = await prisma.shippedDevice.findUnique({ where: { sn }, select: { sn: true } });
        if (!shipped) return NextResponse.json({ error: "SN_NOT_FOUND" }, { status: 400 });

        if (installType === "installer") {
            const installer = await prisma.installer.findUnique({
                where: { phone: installerPhone },
                select: { id: true },
            });
            if (!installer) {
                return NextResponse.json({ error: "INSTALLER_NOT_FOUND" }, { status: 400 });
            }
        }

        const token = installType === "installer" ? crypto.randomBytes(16).toString("hex") : null;
        const expiresAt = installType === "installer" ? new Date(Date.now() + 72 * 3600 * 1000) : null;
        const freeEnd = addDays(installDate, 365);
        const status = installType === "self" ? "confirmed" : "submitted";
        const confirmedAt = installType === "self" ? new Date() : null;
        const confirmedBy = installType === "self" ? "self_install" : null;
        const installerPhoneValue = installType === "installer" ? installerPhone : null;

        const existing = await prisma.warrantyRegistration.findUnique({
            where: { sn },
            select: { id: true, status: true },
        });

        if (existing?.status === "confirmed") {
            return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
        }

        let regId: string;

        if (existing) {
            await prisma.warrantyRegistration.update({
                where: { id: existing.id },
                data: {
                    installType,
                    installDate,
                    userPhone,
                    installerPhone: installerPhoneValue,
                    consentPrivacy: true,
                    confirmToken: token,
                    confirmTokenExpiresAt: expiresAt,
                    freeAsEndDate: freeEnd,
                    submittedAt: new Date(),
                    status,
                    confirmedAt,
                    confirmedBy,
                },
            });
            regId = existing.id;
        } else {
            const id = crypto.randomUUID();
            await prisma.warrantyRegistration.create({
                data: {
                    id,
                    sn,
                    installType,
                    installDate,
                    userPhone,
                    installerPhone: installerPhoneValue,
                    consentPrivacy: true,
                    status,
                    confirmToken: token,
                    confirmTokenExpiresAt: expiresAt,
                    freeAsEndDate: freeEnd,
                    submittedAt: new Date(),
                    confirmedAt,
                    confirmedBy,
                },
            });
            regId = id;
        }

        if (installType === "self") {
            return NextResponse.json({
                ok: true,
                id: regId,
                status: "confirmed",
                installType,
                freeAsEndDate: freeEnd,
            });
        }

        const confirmLink = `${getBaseUrl()}/confirm?t=${encodeURIComponent(token as string)}`;
        const smsText = `설치 정보 확인 링크입니다. 확인해주시면 설치 날짜부터 보증기간 적용됩니다.\n${confirmLink}`;
        await sendSms(krToE164(installerPhone), smsText);

        console.log("[SMS SENT][REGISTER] to:", installerPhone, "link:", confirmLink);

        return NextResponse.json({
            ok: true,
            id: regId,
            confirmLink,
            status: "submitted",
            installType,
            freeAsEndDate: freeEnd,
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
    }
}
