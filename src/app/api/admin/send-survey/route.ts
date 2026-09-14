import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { buildSurveySmsText, SURVEY_SMS_SUBJECT } from "@/lib/survey/send";
import { getErrorMessage } from "@/lib/error";

export async function POST(req: Request) {
    try {
        const { errorResponse } = await requireAdminApi(1);
        if (errorResponse) return errorResponse;

        const body = await req.json();
        const registrationId = body.registrationId ? String(body.registrationId).trim() : null;
        const registrationIds = Array.isArray(body.registrationIds)
            ? (body.registrationIds as unknown[]).map((id) => String(id).trim())
            : null;

        if (!registrationId && (!registrationIds || registrationIds.length === 0)) {
            return NextResponse.json({ error: "INVALID_REGISTRATION_ID" }, { status: 400 });
        }

        if (registrationIds) {
            // Retrieve registrations pending survey
            const regs = await prisma.warrantyRegistration.findMany({
                where: { id: { in: registrationIds } },
                select: {
                    id: true,
                    installType: true,
                    status: true,
                    userPhone: true,
                    confirmedAt: true,
                },
            });

            const eligibleRegs = regs.filter(
                (reg) => reg.installType === "installer" && reg.status === "confirmed"
            );

            if (eligibleRegs.length === 0) {
                return NextResponse.json({ error: "NO_ELIGIBLE_REGISTRATIONS", sentCount: 0 }, { status: 400 });
            }

            let sentCount = 0;
            const errors: string[] = [];

            for (const reg of eligibleRegs) {
                try {
                    // 자동 발송(cron)과 같은 문구를 쓴다.
                    await sendSms(reg.userPhone, buildSurveySmsText(reg.id), SURVEY_SMS_SUBJECT);
                    console.log(`[BATCH SURVEY SMS SENT] Registration ID: ${reg.id}, Phone: ${reg.userPhone}`);

                    // Update the sent timestamp in DB
                    await prisma.warrantyRegistration.update({
                        where: { id: reg.id },
                        data: { surveySentAt: new Date() },
                    });

                    sentCount++;
                } catch (err: unknown) {
                    console.error(`[Batch Send Survey API] Error sending to ${reg.id}:`, err);
                    errors.push(`${reg.id}: ${getErrorMessage(err, "UNKNOWN_ERROR")}`);
                }
            }

            return NextResponse.json({
                success: true,
                sentCount,
                totalRequested: registrationIds.length,
                eligibleCount: eligibleRegs.length,
                errors: errors.length > 0 ? errors : undefined,
            });
        }

        // Single registration ID flow (backward compatibility)
        const reg = await prisma.warrantyRegistration.findUnique({
            where: { id: registrationId! },
            select: {
                id: true,
                installType: true,
                status: true,
                userPhone: true,
                confirmedAt: true,
            },
        });

        if (!reg) {
            return NextResponse.json({ error: "REGISTRATION_NOT_FOUND" }, { status: 400 });
        }

        // 2) Validate eligibility
        if (reg.installType !== "installer") {
            return NextResponse.json({ error: "NOT_ELIGIBLE_INSTALL_TYPE" }, { status: 400 });
        }

        if (reg.status !== "confirmed") {
            return NextResponse.json({ error: "REGISTRATION_NOT_CONFIRMED" }, { status: 400 });
        }

        await sendSms(reg.userPhone, buildSurveySmsText(reg.id), SURVEY_SMS_SUBJECT);

        console.log(`[MANUAL SURVEY SMS SENT] Registration ID: ${reg.id}, Phone: ${reg.userPhone}`);

        // Update the sent timestamp in DB
        await prisma.warrantyRegistration.update({
            where: { id: reg.id },
            data: { surveySentAt: new Date() },
        });

        return NextResponse.json({ success: true, sentCount: 1 });
    } catch (error: unknown) {
        console.error("[Manual Send Survey API] Error:", error);
        return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
    }
}
