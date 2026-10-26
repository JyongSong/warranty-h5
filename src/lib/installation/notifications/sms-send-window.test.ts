import { describe, expect, it } from "vitest";
import {
  isInstallationSmsSendWindowOpen,
  isInstallerAssignmentFirstNotificationOpen,
} from "./sms-send-window";

const window = { start: "08:00", end: "20:00" };

describe("isInstallationSmsSendWindowOpen", () => {
  it.each([
    ["2026-07-15T22:59:00.000Z", false], // 07:59 KST
    ["2026-07-15T23:00:00.000Z", true], // 08:00 KST
    ["2026-07-16T10:59:00.000Z", true], // 19:59 KST
    ["2026-07-16T11:00:00.000Z", false], // 20:00 KST
  ])("evaluates %s in Asia/Seoul", (iso, expected) => {
    expect(isInstallationSmsSendWindowOpen(new Date(iso), window)).toBe(expected);
  });

  it("supports a send window crossing midnight", () => {
    expect(
      isInstallationSmsSendWindowOpen(new Date("2026-07-16T15:30:00.000Z"), {
        start: "20:00",
        end: "08:00",
      }),
    ).toBe(true);
  });
});

describe("isInstallerAssignmentFirstNotificationOpen", () => {
  // 08:00~20:00, 응답 5시간 → 15:00 까지만 첫 알림을 보낸다.
  it.each([
    ["2026-07-15T22:59:00.000Z", false], // 07:59 KST — 발송 시간대 밖
    ["2026-07-15T23:00:00.000Z", true], // 08:00 KST
    ["2026-07-16T06:00:00.000Z", true], // 15:00 KST — 마감 20:00
    ["2026-07-16T06:01:00.000Z", false], // 15:01 KST — 마감이 밤에 걸린다
    ["2026-07-16T10:00:00.000Z", false], // 19:00 KST
  ])("evaluates %s in Asia/Seoul", (iso, expected) => {
    expect(isInstallerAssignmentFirstNotificationOpen(new Date(iso), window, 5)).toBe(expected);
  });

  it("follows the send window only when it is shorter than the response time", () => {
    expect(
      isInstallerAssignmentFirstNotificationOpen(new Date("2026-07-16T03:00:00.000Z"), {
        start: "10:00",
        end: "14:00",
      }, 5),
    ).toBe(true);
  });
});
