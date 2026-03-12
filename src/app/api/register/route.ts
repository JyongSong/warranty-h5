import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendSms } from "@/lib/sms";
import { krToE164, normalizePhone } from "@/lib/phone";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { getErrorMessage } from "@/lib/error";
import { mysqlPool } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

function addDays(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function toMysqlDatetime(date: Date | null) {
    if (!date) return null;
    return date.toISOString().slice(0, 23).replace("T", " ").replace("Z", "");
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
        const [shippedRows] = await mysqlPool.execute<RowDataPacket[]>(
            "SELECT sn FROM shipped_devices WHERE sn = ? LIMIT 1",
            [sn]
        );
        if (!shippedRows[0]) return NextResponse.json({ error: "SN_NOT_FOUND" }, { status: 400 });

        if (installType === "installer") {
            const [installerRows] = await mysqlPool.execute<RowDataPacket[]>(
                "SELECT id FROM installers WHERE phone = ? LIMIT 1",
                [installerPhone]
            );
            if (!installerRows[0]) {
                return NextResponse.json({ error: "INSTALLER_NOT_FOUND" }, { status: 400 });
            }
        }

        const token = installType === "installer" ? crypto.randomBytes(16).toString("hex") : null;
        const expiresAt =
            installType === "installer"
                ? toMysqlDatetime(new Date(Date.now() + 72 * 3600 * 1000))
                : null;
        const freeEnd = addDays(installDate, 365);
        const status = installType === "self" ? "confirmed" : "submitted";
        const confirmedAt = installType === "self" ? new Date() : null;
        const confirmedBy = installType === "self" ? "self_install" : null;
        const installerPhoneValue = installType === "installer" ? installerPhone : null;

        const [existingRows] = await mysqlPool.execute<(RowDataPacket & { id: string; status: string })[]>(
            "SELECT id, status FROM warranty_registrations WHERE sn = ? LIMIT 1",
            [sn]
        );
        const existing = existingRows[0];

        if (existing?.status === "confirmed") {
            return NextResponse.json({ error: "ALREADY_CONFIRMED" }, { status: 400 });
        }

        let regId: string;

        if (existing) {
            await mysqlPool.execute<ResultSetHeader>(
                `UPDATE warranty_registrations
                 SET
                   install_type = ?,
                   install_date = ?,
                   user_phone = ?,
                   installer_phone = ?,
                   consent_privacy = ?,
                   confirm_token = ?,
                   confirm_token_expires_at = ?,
                   free_as_end_date = ?,
                   submitted_at = NOW(3),
                   status = ?,
                   confirmed_at = ?,
                   confirmed_by = ?,
                   updated_at = NOW(3)
                 WHERE id = ?`,
                [
                    installType,
                    installDate,
                    userPhone,
                    installerPhoneValue,
                    1,
                    token,
                    expiresAt,
                    freeEnd,
                    status,
                    toMysqlDatetime(confirmedAt),
                    confirmedBy,
                    existing.id,
                ]
            );
            regId = existing.id;
        } else {
            const id = crypto.randomUUID();
            await mysqlPool.execute<ResultSetHeader>(
                `INSERT INTO warranty_registrations
                  (id, sn, install_type, install_date, user_phone, installer_phone, consent_privacy, status, confirm_token, confirm_token_expires_at, free_as_end_date, submitted_at, confirmed_at, confirmed_by, created_at, updated_at)
                 VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, NOW(3), NOW(3))`,
                [
                    id,
                    sn,
                    installType,
                    installDate,
                    userPhone,
                    installerPhoneValue,
                    1,
                    status,
                    token,
                    expiresAt,
                    freeEnd,
                    toMysqlDatetime(confirmedAt),
                    confirmedBy,
                ]
            );
            regId = id;
        }

        if (installType === "self") {
            return NextResponse.json({ ok: true, id: regId, status: "confirmed", installType });
        }

        const confirmLink = `${getBaseUrl()}/confirm?t=${encodeURIComponent(token as string)}`;
        const smsText = `[Aqara] 설치 완료 확인 링크입니다.\n${confirmLink}`;
        await sendSms(krToE164(installerPhone), smsText);

        console.log("[SMS MOCK] to:", installerPhone, "link:", confirmLink);

        return NextResponse.json({ ok: true, id: regId, confirmLink, status: "submitted", installType });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
    }
}
