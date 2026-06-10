import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from "@/lib/error";
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

        // 1) SN 必须在出货清单中
        const shipped = await prisma.shippedDevice.findUnique({ where: { sn }, select: { sn: true } });
        if (!shipped) return NextResponse.json({ error: "SN_NOT_FOUND" }, { status: 400 });

        // 2) 检查技师信息
        const finalInstallType = installType;
        if (installType === "installer") {
            const installer = await prisma.installer.findUnique({
                where: { phone: installerPhone },
                select: { id: true },
            });
            if (!installer) {
                return NextResponse.json({ error: "INSTALLER_NOT_FOUND" }, { status: 400 });
            }
        }

        const freeEnd = addDays(installDate, finalInstallType === "installer" ? 730 : 365);
        const status = "confirmed";
        const confirmedAt = new Date();
        const confirmedBy = "admin";
        const installerPhoneValue = requiresInstallerPhone ? installerPhone : null;

        const existing = await prisma.warrantyRegistration.findUnique({
            where: { sn },
            select: { id: true, status: true },
        });

        if (existing?.status === "confirmed") {
            return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
        }

        let regId = "";

        // 在事务内处理数据创建/更新以及增加技师安装次数
        await prisma.$transaction(async (tx) => {
            if (existing) {
                await tx.warrantyRegistration.update({
                    where: { id: existing.id },
                    data: {
                        installType: finalInstallType,
                        installDate,
                        userPhone,
                        installerPhone: installerPhoneValue,
                        consentPrivacy: true,
                        consentMarketing: false, // 默认不勾选营销同意
                        confirmToken: null,
                        confirmTokenExpiresAt: null,
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
                await tx.warrantyRegistration.create({
                    data: {
                        id,
                        sn,
                        installType: finalInstallType,
                        installDate,
                        userPhone,
                        installerPhone: installerPhoneValue,
                        consentPrivacy: true,
                        consentMarketing: false,
                        status,
                        confirmToken: null,
                        confirmTokenExpiresAt: null,
                        freeAsEndDate: freeEnd,
                        submittedAt: new Date(),
                        confirmedAt,
                        confirmedBy,
                    },
                });
                regId = id;
            }

            // 更新技师安装次数
            if (finalInstallType === "installer" && installerPhoneValue) {
                const installer = await tx.installer.findUnique({
                    where: { phone: installerPhoneValue },
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

        // 异步发送用户质保完成短信（在 transaction 外发，防止失败回滚）
        const userSmsText = buildUserCompletionSms({
            installType: finalInstallType,
            freeAsEndDate: freeEnd,
            installerPhone: finalInstallType === "installer" ? installerPhoneValue : null,
        });
        await sendSms(userPhone, userSmsText);
        console.log("[SMS SENT][ADMIN_REGISTER→USER]", { to: userPhone, installType: finalInstallType });

        return NextResponse.json({
            ok: true,
            id: regId,
            status: "confirmed",
            installType: finalInstallType,
            freeAsEndDate: freeEnd,
        });

    } catch (error: unknown) {
        console.error("[Admin Register API] Error:", error);
        return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
    }
}
