import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALIMTALK_TEMPLATES,
  AlimtalkTemplateError,
  buildAlimtalkKakaoOptions,
  getAlimtalkPfId,
  stripUrlProtocol,
} from "@/lib/notifications/alimtalk";

const PF_ID = "KA01PF260706032300158y6gaHPMaEfL";

describe("alimtalk template registry", () => {
  const originalPfId = process.env.SOLAPI_KAKAO_PF_ID;

  beforeEach(() => {
    process.env.SOLAPI_KAKAO_PF_ID = PF_ID;
  });

  afterEach(() => {
    if (originalPfId === undefined) delete process.env.SOLAPI_KAKAO_PF_ID;
    else process.env.SOLAPI_KAKAO_PF_ID = originalPfId;
  });

  it("declares a 32-char solapi templateId for every template", () => {
    for (const [key, spec] of Object.entries(ALIMTALK_TEMPLATES)) {
      expect(spec.templateId, key).toMatch(/^KA01TP[A-Za-z0-9]{26}$/);
      expect(spec.variables.length, key).toBeGreaterThan(0);
    }
  });

  it("keeps every fallback and link variable within the declared variable list", () => {
    for (const [key, spec] of Object.entries(ALIMTALK_TEMPLATES)) {
      const declared = new Set<string>(spec.variables);
      for (const name of Object.keys(
        (spec as { fallbacks?: Record<string, string> }).fallbacks ?? {},
      )) {
        expect(declared.has(name), `${key}.fallbacks.${name}`).toBe(true);
      }
      for (const name of (spec as { linkVariables?: readonly string[] }).linkVariables ?? []) {
        expect(declared.has(name), `${key}.linkVariables.${name}`).toBe(true);
      }
    }
  });

  it("builds kakaoOptions with #{} wrapped variable keys and SMS fallback enabled", () => {
    const options = buildAlimtalkKakaoOptions({
      templateKey: "assignment_completed",
      variables: { branchName: "강남점", installerPhone: "010-9999-0000" },
    });

    expect(options).toEqual({
      pfId: PF_ID,
      templateId: "KA01TP26070707483285849dA5feTIvF",
      variables: {
        "#{branchName}": "강남점",
        "#{installerPhone}": "010-9999-0000",
      },
      disableSms: false,
    });
  });

  it("substitutes the declared fallback for an empty variable", () => {
    const options = buildAlimtalkKakaoOptions({
      templateKey: "user_registration_completed",
      variables: {
        installType: "자가 설치",
        freeAsEndDate: "2027-08-19",
        installerPhone: null,
      },
    });

    expect(options.variables["#{installerPhone}"]).toBe("해당 없음");
  });

  it("strips the protocol from link variables so the button link is not doubled", () => {
    const options = buildAlimtalkKakaoOptions({
      templateKey: "installer_confirm_link",
      variables: { confirmLink: "https://warranty-h5.vercel.app/confirm?t=abc" },
    });

    expect(options.variables["#{confirmLink}"]).toBe("warranty-h5.vercel.app/confirm?t=abc");
  });

  it("throws when a required variable is empty and has no fallback", () => {
    expect(() =>
      buildAlimtalkKakaoOptions({
        templateKey: "assignment_completed",
        variables: { branchName: "강남점", installerPhone: "  " },
      }),
    ).toThrowError(AlimtalkTemplateError);
  });

  it("throws when an unknown variable is passed", () => {
    expect(() =>
      buildAlimtalkKakaoOptions({
        templateKey: "assignment_completed",
        variables: { branchName: "강남점", installerPhone: "01099990000", productSummary: "K100" },
      }),
    ).toThrowError(/없는 변수/);
  });

  it("throws when the pfId env var is missing", () => {
    delete process.env.SOLAPI_KAKAO_PF_ID;
    expect(getAlimtalkPfId()).toBeNull();
    expect(() =>
      buildAlimtalkKakaoOptions({
        templateKey: "assignment_completed",
        variables: { branchName: "강남점", installerPhone: "01099990000" },
      }),
    ).toThrowError(/SOLAPI_KAKAO_PF_ID/);
  });

  it("leaves a protocol-less url untouched", () => {
    expect(stripUrlProtocol("warranty-h5.vercel.app/confirm?t=abc")).toBe(
      "warranty-h5.vercel.app/confirm?t=abc",
    );
    expect(stripUrlProtocol("http://example.com/a")).toBe("example.com/a");
  });
});
