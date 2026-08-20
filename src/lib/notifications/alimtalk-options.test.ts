import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isSystemSettingEnabledMock } = vi.hoisted(() => ({
  isSystemSettingEnabledMock: vi.fn(),
}));

vi.mock("@/lib/backoffice/system-settings", () => ({
  SYSTEM_SETTING_KEYS: { notificationsAlimtalkEnabled: "notifications.alimtalk.enabled" },
  isSystemSettingEnabled: isSystemSettingEnabledMock,
}));

const {
  buildAlimtalkKakaoOptionsOrNull,
  isAlimtalkEnabled,
  resolveAlimtalkKakaoOptions,
} = await import("@/lib/notifications/alimtalk-options");

const PF_ID = "KA01PF260706032300158y6gaHPMaEfL";
const validVariables = { branchName: "강남점", installerPhone: "01011112222" };

describe("alimtalk gate", () => {
  const originalPfId = process.env.SOLAPI_KAKAO_PF_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOLAPI_KAKAO_PF_ID = PF_ID;
    isSystemSettingEnabledMock.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalPfId === undefined) delete process.env.SOLAPI_KAKAO_PF_ID;
    else process.env.SOLAPI_KAKAO_PF_ID = originalPfId;
  });

  it("needs both the pfId env var and the system setting", async () => {
    await expect(isAlimtalkEnabled()).resolves.toBe(true);

    isSystemSettingEnabledMock.mockResolvedValue(false);
    await expect(isAlimtalkEnabled()).resolves.toBe(false);

    isSystemSettingEnabledMock.mockResolvedValue(true);
    delete process.env.SOLAPI_KAKAO_PF_ID;
    await expect(isAlimtalkEnabled()).resolves.toBe(false);
  });

  it("does not read the system setting when the pfId is missing", async () => {
    delete process.env.SOLAPI_KAKAO_PF_ID;

    await isAlimtalkEnabled();

    expect(isSystemSettingEnabledMock).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when a template variable is invalid", () => {
    expect(
      buildAlimtalkKakaoOptionsOrNull({
        templateKey: "assignment_completed",
        variables: { branchName: "강남점", installerPhone: "" },
      }),
    ).toBeNull();
  });

  it("resolves to null while the switch is off, without building options", async () => {
    isSystemSettingEnabledMock.mockResolvedValue(false);

    await expect(
      resolveAlimtalkKakaoOptions({
        templateKey: "assignment_completed",
        variables: validVariables,
      }),
    ).resolves.toBeNull();
  });

  it("resolves full kakaoOptions while the switch is on", async () => {
    await expect(
      resolveAlimtalkKakaoOptions({
        templateKey: "assignment_completed",
        variables: validVariables,
      }),
    ).resolves.toEqual({
      pfId: PF_ID,
      templateId: "KA01TP26070707483285849dA5feTIvF",
      variables: {
        "#{branchName}": "강남점",
        "#{installerPhone}": "01011112222",
      },
      disableSms: false,
    });
  });
});
