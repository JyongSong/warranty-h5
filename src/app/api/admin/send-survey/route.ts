import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { getErrorMessage } from "@/lib/error";

export async function POST(req: Request) {
    try {
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
                    const surveyLink = `${getBaseUrl()}/satisfaction-survey?id=${reg.id}`;
                    const subject = "[Aqara]";
                    const smsText = `설문 참여하고 커피 쿠폰 받으세요!

안녕하세요, 고객님.
아카라 스마트 도어락을 이용해주셔서 감사합니다.

더 나은 제품과 서비스를 제공해드리고자 간단한 만족도 조사를 진행하고 있습니다.
설문에 참여해주신 모든 분들께 감사의 마음을 담아 커피 쿠폰을 선물로 드립니다. (1분 소요)

■ 설문 참여 링크: ${surveyLink}

잠시만 시간 내어 소중한 의견을 들려주시면 감사하겠습니다.

문의: https://o8znz.channel.io
※ 발신전용`;

                    // Send SMS via solapi
                    await sendSms(reg.userPhone, smsText, subject);
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

        const surveyLink = `${getBaseUrl()}/satisfaction-survey?id=${reg.id}`;
        const subject = "[Aqara]";
        const smsText = `설문 참여하고 커피 쿠폰 받으세요!

안녕하세요, 고객님.
아카라 스마트 도어락을 이용해주셔서 감사합니다.

더 나은 제품과 서비스를 제공해드리고자 간단한 만족도 조사를 진행하고 있습니다.
설문에 참여해주신 모든 분들께 감사의 마음을 담아 커피 쿠폰을 선물로 드립니다. (1분 소요)

■ 설문 참여 링크: ${surveyLink}

잠시만 시간 내어 소중한 의견을 들려주시면 감사하겠습니다.

문의: https://o8znz.channel.io
※ 발신전용`;

        // Send SMS via solapi
        await sendSms(reg.userPhone, smsText, subject);

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
