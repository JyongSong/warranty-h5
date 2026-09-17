// 만족도 조사 문자 발송. 수동 발송(백오피스 버튼)과 자동 발송(cron)이 같은
// 문구·같은 대상 판정을 쓴다.

import { getBaseUrl } from "@/lib/getBaseUrl";
import { prisma } from "@/lib/prisma";
import { type AlimtalkRequest } from "@/lib/notifications/alimtalk";
import { sendSms } from "@/lib/sms";
import { hasPassedKstBusinessDays } from "@/lib/survey/business-days";

/** 설치 확정 후 이만큼의 영업일이 지나야 설문을 보낸다. */
export const SURVEY_SEND_BUSINESS_DAYS = 7;

const SURVEY_SMS_SUBJECT = "[Aqara]";

/**
 * 만족도 조사 안내. 알림톡이 꺼져 있거나 카카오 발송이 실패하면 text 가 SMS 로
 * 나간다. 수동 발송(백오피스)과 자동 발송(cron)이 이 빌더 하나를 쓴다.
 */
export function buildSurveySms(registrationId: string, baseUrl = getBaseUrl()) {
  const surveyLink = `${baseUrl}/satisfaction-survey?id=${registrationId}`;

  // 알림톡 템플릿 "만족도 조사 참여 안내". 링크는 본문이 아니라 버튼에 들어가고
  // 버튼이 `https://#{surveyUrl}` 로 등록돼 있어, 레지스트리의 linkVariables 가
  // 값에서 프로토콜을 떼어낸다.
  const alimtalk: AlimtalkRequest = {
    templateKey: "satisfaction_survey",
    variables: { surveyUrl: surveyLink },
  };

  const text = `1분 설문 참여하고 커피 쿠폰 받으세요!

고객님, 아카라 스마트 도어락 잘 사용하고 계신가요?
사용하시면서 좋았던 점이나 불편했던 점을 들려주세요.

설문을 완료해주신 모든 고객님께 커피 쿠폰을 드립니다.

■ 소요 시간: 1분 이내
■ 참여 혜택: 커피 쿠폰

▼ 설문 참여하기
${surveyLink}

고객님의 의견을 제품과 서비스 개선에 반영하겠습니다. 감사합니다.

문의: https://o8znz.channel.io
※ 본 문자는 발신 전용입니다.`;

  return { subject: SURVEY_SMS_SUBJECT, text, alimtalk };
}

/** 설문 안내 1건 발송. 수동/자동 발송이 같은 호출 형태를 쓰게 모아 둔다. */
export async function sendSurveySms(phone: string | null | undefined, registrationId: string) {
  const sms = buildSurveySms(registrationId);
  await sendSms(phone, sms.text, sms.subject, { alimtalk: sms.alimtalk });
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
      await sendSurveySms(reg.userPhone, reg.id);

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
