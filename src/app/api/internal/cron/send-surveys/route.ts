import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { getBaseUrl } from "@/lib/getBaseUrl";

const KOREAN_HOLIDAYS_2026 = [
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", "2026-03-02", // 삼일절 및 대체공휴일
  "2026-05-05", // 어린이날
  "2026-05-24", "2026-05-25", // 부처님오신날 및 대체공휴일
  "2026-06-06", // 현충일
  "2026-08-15", "2026-08-17", // 광복절 및 대체공휴일
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
  "2026-10-03", // 개천절
  "2026-10-09", // 한글날
  "2026-12-25"  // 기독탄신일(크리스마스)
];

function isWeekendOrHoliday(date: Date): boolean {
  // Get KST day of week: Sun, Mon, etc.
  const kstWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(date);

  if (kstWeekday === "Sat" || kstWeekday === "Sun") return true;

  // Get KST date string: YYYY-MM-DD
  const kstDateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(date);

  return KOREAN_HOLIDAYS_2026.includes(kstDateStr);
}

function hasPassedBusinessDays(confirmedAt: Date, targetBusinessDays: number): boolean {
  const start = new Date(confirmedAt);
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start >= today) return false;

  let businessDays = 0;
  const current = new Date(start);

  while (current < today) {
    current.setDate(current.getDate() + 1);
    if (!isWeekendOrHoliday(current)) {
      businessDays++;
    }
  }

  return businessDays >= targetBusinessDays;
}

export async function POST(request: Request) {
  return handleCronRequest(request);
}

export async function GET(request: Request) {
  return handleCronRequest(request);
}

async function handleCronRequest(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;

    // Verify token
    if (process.env.NODE_ENV === "production" && authHeader !== expectedHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Retrieve registrations pending survey
    const registrations = await prisma.warrantyRegistration.findMany({
      where: {
        installType: "installer",
        status: "confirmed",
        surveySentAt: null,
        confirmedAt: { not: null },
      },
    });

    const dueRegistrations = registrations.filter((reg) =>
      reg.confirmedAt && hasPassedBusinessDays(reg.confirmedAt, 7)
    );

    let sentCount = 0;

    for (const reg of dueRegistrations) {
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

      // Log sending to server terminal
      console.log(`[SURVEY SMS SENT] Phone: ${reg.userPhone}, Link: ${surveyLink}`);

      // Mark as sent
      await prisma.warrantyRegistration.update({
        where: { id: reg.id },
        data: { surveySentAt: new Date() },
      });

      sentCount++;
    }

    return NextResponse.json({
      success: true,
      scanned: registrations.length,
      sent: sentCount,
    });
  } catch (error: unknown) {
    console.error("[Cron Survey API] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
