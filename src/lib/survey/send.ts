// 만족도 조사 문자 발송. 수동 발송(백오피스 버튼)과 자동 발송(cron)이 같은
// 문구·같은 대상 판정을 쓴다.

import { getBaseUrl } from "@/lib/getBaseUrl";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { hasPassedKstBusinessDays } from "@/lib/survey/business-days";

/** 설치 확정 후 이만큼의 영업일이 지나야 설문을 보낸다. */
export const SURVEY_SEND_BUSINESS_DAYS = 7;

export const SURVEY_SMS_SUBJECT = "[Aqara]";

export function buildSurveySmsText(registrationId: string, baseUrl = getBaseUrl()) {
  const surveyLink = `${baseUrl}/satisfaction-survey?id=${registrationId}`;

  return `설문 참여하고 커피 쿠폰 받으세요!

안녕하세요, 고객님.
아카라 스마트 도어락을 이용해주셔서 감사합니다.

더 나은 제품과 서비스를 제공해드리고자 간단한 만족도 조사를 진행하고 있습니다.
설문에 참여해주신 모든 분들께 감사의 마음을 담아 커피 쿠폰을 선물로 드립니다. (1분 소요)

■ 설문 참여 링크: ${surveyLink}

잠시만 시간 내어 소중한 의견을 들려주시면 감사하겠습니다.

문의: https://o8znz.channel.io
※ 발신전용`;
}

export type SendDueSurveysResult = {
  scanned: number;
  due: number;
  sent: number;
  failed: number;
  /** 이번 실행의 상한에 걸려 남겨 둔 건수. 다음 실행에서 이어 보낸다. */
  remaining: number;
};

/**
 * 발송 대기(설치 기사 설치 · 확정 · 미발송 · 7영업일 경과) 건에 설문 문자를 보낸다.
 * 한 번에 너무 많이 보내다 함수가 끊기지 않도록 limit 로 끊고, 남은 건수는 돌려준다.
 */
export async function sendDueSatisfactionSurveys({
  now = new Date(),
  limit = 200,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<SendDueSurveysResult> {
  const registrations = await prisma.warrantyRegistration.findMany({
    where: {
      installType: "installer",
      status: "confirmed",
      surveySentAt: null,
      confirmedAt: { not: null },
    },
    select: { id: true, userPhone: true, confirmedAt: true },
    orderBy: { confirmedAt: "asc" },
  });

  const due = registrations.filter(
    (reg) => reg.confirmedAt && hasPassedKstBusinessDays(reg.confirmedAt, SURVEY_SEND_BUSINESS_DAYS, now),
  );
  const targets = due.slice(0, limit);

  let sent = 0;
  let failed = 0;

  for (const reg of targets) {
    try {
      await sendSms(reg.userPhone, buildSurveySmsText(reg.id), SURVEY_SMS_SUBJECT);

      // 발송 표시. 이걸 남기지 못하면 다음 실행에서 같은 사람에게 또 간다.
      await prisma.warrantyRegistration.update({
        where: { id: reg.id },
        data: { surveySentAt: new Date() },
      });

      sent++;
    } catch (error) {
      failed++;
      console.error("[survey/send] 발송 실패", { registrationId: reg.id, error });
    }
  }

  return {
    scanned: registrations.length,
    due: due.length,
    sent,
    failed,
    remaining: due.length - targets.length,
  };
}
