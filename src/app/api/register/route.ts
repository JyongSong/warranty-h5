import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";
import { buildUserCompletionSms } from "@/lib/userSms";

function addDays(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const sn = String(body.sn ?? "").trim();
        const installType =
            body.installType === "self"
                ? "self"
                : body.installType === "external"
                  ? "external"
                  : "installer";
        const installDate = String(body.installDate ?? "");
        const userPhone = normalizePhone(body.userPhone);
        const installerPhone = normalizePhone(body.installerPhone);
        const consentPrivacy = body.consentPrivacy === true;
        const consentMarketing = body.consentMarketing === true;
        const requiresInstallerPhone = installType === "installer" || installType === "external";

        if (!sn || sn.length < 6) return NextResponse.json({ error: "INVALID_SN" }, { status: 400 });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate))
            return NextResponse.json({ error: "INVALID_INSTALL_DATE" }, { status: 400 });

        const today = new Date().toISOString().slice(0, 10);
        if (installDate > today) return NextResponse.json({ error: "INSTALL_DATE_IN_FUTURE" }, { status: 400 });

        if (userPhone.length < 9) return NextResponse.json({ error: "INVALID_USER_PHONE" }, { status: 400 });
        if (requiresInstallerPhone && installerPhone.length < 9) {
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

        const token = requiresInstallerPhone ? crypto.randomBytes(16).toString("hex") : null;
        const expiresAt = requiresInstallerPhone ? new Date(Date.now() + 72 * 3600 * 1000) : null;
        // 본사 공인 기사 시공만 2년 무상 A/S, 자가/외부 기사는 1년
        const freeEnd = addDays(installDate, installType === "installer" ? 730 : 365);
        const status = installType === "self" ? "confirmed" : "submitted";
        const confirmedAt = installType === "self" ? new Date() : null;
        const confirmedBy = installType === "self" ? "self_install" : null;
        const installerPhoneValue = requiresInstallerPhone ? installerPhone : null;

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
                    consentMarketing,
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
                    consentMarketing,
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

        // 자가/외부 기사: 등록 즉시 완료 → 사용자에게 SMS 발송.
        // 인증 기사: 기사 confirm 후 (/api/confirm) 에서 사용자 SMS 발송.
        if (installType === "self" || installType === "external") {
            const userSmsText = buildUserCompletionSms({
                installType,
                freeAsEndDate: freeEnd,
                installerPhone: null,
            });
            await sendSms(userPhone, userSmsText);
            console.log("[SMS SENT][REGISTER→USER]", { to: userPhone, installType });

            return NextResponse.json({
                ok: true,
                id: regId,
                status: installType === "self" ? "confirmed" : "submitted",
                installType,
                freeAsEndDate: freeEnd,
            });
        }

        // 인증 기사: 기사에게 confirm link SMS
        const confirmLink = `${getBaseUrl()}/confirm?t=${encodeURIComponent(token as string)}`;
        const installerSmsText = `[Aqara] 설치 확인이 필요합니다.\n72시간 이내에 아래 링크에서 설치 정보를 확인해 주세요. 확인 후 보증기간이 적용됩니다.\n${confirmLink}`;
        await sendSms(installerPhone, installerSmsText);

        console.log("[SMS SENT][REGISTER→INSTALLER]", { to: installerPhone, link: confirmLink });

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
