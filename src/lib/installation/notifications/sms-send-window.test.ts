import { describe, expect, it } from "vitest";
import { isInstallationSmsSendWindowOpen } from "./sms-send-window";

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
