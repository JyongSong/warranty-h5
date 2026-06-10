import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { getErrorMessage } from "@/lib/error";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const registrationId = String(body.registrationId ?? "").trim();

        if (!registrationId) {
            return NextResponse.json({ error: "INVALID_REGISTRATION_ID" }, { status: 400 });
        }

        // 1) Retrieve registrations pending survey
        const reg = await prisma.warrantyRegistration.findUnique({
            where: { id: registrationId },
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

        const smsText = `[아카라 라이프] 만족도 조사 안내

안녕하세요, 고객님.
아카라 스마트 도어락을 이용해주셔서 감사합니다.

고객님께서 실제 사용하시며 느끼신 소중한 의견을 듣고, 더 나은 제품 및 서비스를 제공해드리고자 간단한 만족도 조사를 진행하고 있습니다.

설문에 참여해주신 고객님께는 소정의 감사 선물 (커피 쿠폰)도 함께 제공드릴 예정입니다.
잠시만 시간 내어 응답 부탁드립니다.

■ 설문 참여 링크: ${surveyLink}

사용 중 불편하시거나 도움이 필요하신 부분이 있으시면 언제든 아카라 고객센터로 편하게 문의 부탁드립니다.

문의: https://o8znz.channel.io
※ 발신전용`;

        // Send SMS via solapi
        await sendSms(reg.userPhone, smsText);

        console.log(`[MANUAL SURVEY SMS SENT] Registration ID: ${reg.id}, Phone: ${reg.userPhone}`);

        // Update the sent timestamp in DB
        await prisma.warrantyRegistration.update({
            where: { id: reg.id },
            data: { surveySentAt: new Date() },
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("[Manual Send Survey API] Error:", error);
        return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
    }
}
