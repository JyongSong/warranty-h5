import { describe, expect, it } from "vitest";
import { buildUserCompletionSms } from "@/lib/userSms";
import { buildInstallerConfirmSms } from "@/lib/installerSms";
import { ALIMTALK_TEMPLATES } from "@/lib/notifications/alimtalk";
import { CONFIRM_TOKEN_TTL_HOURS } from "@/lib/confirmToken";

describe("buildUserCompletionSms", () => {
  it("carries the installer phone into both the SMS body and the alimtalk variables", () => {
    const built = buildUserCompletionSms({
      installType: "installer",
      freeAsEndDate: "2028-08-19",
      installerPhone: "01011112222",
    });

    expect(built.text).toContain("기사님 연락처: 010-1111-2222");
    expect(built.alimtalk).toEqual({
      templateKey: "user_registration_completed",
      variables: {
        installType: "본사 공인 기사 설치",
        freeAsEndDate: "2028-08-19",
        installerPhone: "010-1111-2222",
      },
    });
  });

  it("leaves the installer phone null for self installs so the registry fallback applies", () => {
    const built = buildUserCompletionSms({
      installType: "self",
      freeAsEndDate: "2028-08-19",
      installerPhone: null,
    });

    expect(built.text).not.toContain("기사님 연락처");
    expect(built.alimtalk.variables).toMatchObject({
      installType: "자가 설치",
      installerPhone: null,
    });
    expect(ALIMTALK_TEMPLATES.user_registration_completed.fallbacks.installerPhone).toBe(
      "해당 없음",
    );
  });

  it("ignores a stray installer phone on an external install", () => {
    const built = buildUserCompletionSms({
      installType: "external",
      freeAsEndDate: "2028-08-19",
      installerPhone: "01011112222",
    });

    expect(built.alimtalk.variables.installerPhone).toBeNull();
  });

  it("declares exactly the variables the registered template expects", () => {
    const built = buildUserCompletionSms({
      installType: "installer",
      freeAsEndDate: "2028-08-19",
      installerPhone: "01011112222",
    });

    expect(Object.keys(built.alimtalk.variables).sort()).toEqual(
      [...ALIMTALK_TEMPLATES.user_registration_completed.variables].sort(),
    );
  });
});

describe("buildInstallerConfirmSms", () => {
  const confirmLink = "https://warranty-h5.vercel.app/confirm?t=abc";

  it("keeps the SMS body in sync with the token TTL constant", () => {
    const built = buildInstallerConfirmSms({ confirmLink });

    expect(built.text).toContain(`${CONFIRM_TOKEN_TTL_HOURS}시간 이내에`);
    expect(built.text).toContain(confirmLink);
  });

  it("passes the full url through; the registry strips the protocol for the button", () => {
    const built = buildInstallerConfirmSms({ confirmLink });

    expect(built.alimtalk).toEqual({
      templateKey: "installer_confirm_link",
      variables: { confirmLink },
    });
  });

  it("declares exactly the variables the registered template expects", () => {
    const built = buildInstallerConfirmSms({ confirmLink });

    expect(Object.keys(built.alimtalk.variables).sort()).toEqual(
      [...ALIMTALK_TEMPLATES.installer_confirm_link.variables].sort(),
    );
  });
});
