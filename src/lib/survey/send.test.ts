import { describe, expect, it, vi } from "vitest";
import {
  ALIMTALK_TEMPLATES,
  buildAlimtalkKakaoOptions,
} from "@/lib/notifications/alimtalk";
import { buildSurveySms } from "@/lib/survey/send";

// send.ts 가 prisma/sms 를 끌어오지만 빌더는 둘 다 쓰지 않는다.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));

describe("buildSurveySms", () => {
  it("puts the same survey link in the SMS body and the alimtalk button variable", () => {
    const sms = buildSurveySms("reg-1", "https://aqaralife-service.kr");

    expect(sms.subject).toBe("[Aqara]");
    expect(sms.text).toContain("https://aqaralife-service.kr/satisfaction-survey?id=reg-1");
    expect(sms.alimtalk).toEqual({
      templateKey: "satisfaction_survey",
      variables: { surveyUrl: "https://aqaralife-service.kr/satisfaction-survey?id=reg-1" },
    });
    expect(Object.keys(sms.alimtalk.variables)).toEqual([
      ...ALIMTALK_TEMPLATES.satisfaction_survey.variables,
    ]);
  });

  it("strips the protocol so the registered https://#{surveyUrl} button is not doubled", () => {
    const previous = process.env.SOLAPI_KAKAO_PF_ID;
    process.env.SOLAPI_KAKAO_PF_ID = "KA01PF-test";
    try {
      const options = buildAlimtalkKakaoOptions(
        buildSurveySms("reg-1", "https://aqaralife-service.kr").alimtalk,
      );
      expect(options.variables).toEqual({
        "#{surveyUrl}": "aqaralife-service.kr/satisfaction-survey?id=reg-1",
      });
    } finally {
      if (previous === undefined) delete process.env.SOLAPI_KAKAO_PF_ID;
      else process.env.SOLAPI_KAKAO_PF_ID = previous;
    }
  });
});
