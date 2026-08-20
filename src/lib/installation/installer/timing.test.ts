import { describe, expect, it } from "vitest";
import {
  INSTALLER_PUSH_SMS_FALLBACK_HOURS,
  INSTALLER_RESPONSE_TIMEOUT_HOURS,
  formatInstallerResponseDeadline,
  getInstallerPushSmsFallbackCutoff,
  getInstallerResponseExpiresAt,
} from "@/lib/installation/installer/timing";

describe("installer response timeline", () => {
  it("falls back to SMS well before the assignment times out", () => {
    // 폴백이 타임아웃보다 늦으면 문자가 나가기도 전에 다음 기사에게 넘어간다.
    expect(INSTALLER_PUSH_SMS_FALLBACK_HOURS).toBeLessThan(INSTALLER_RESPONSE_TIMEOUT_HOURS);
  });

  it("computes the deadline from the first notification", () => {
    expect(getInstallerResponseExpiresAt(new Date("2026-06-11T00:00:00.000Z"))).toEqual(
      new Date("2026-06-12T00:00:00.000Z"),
    );
  });

  it("computes the fallback cutoff backwards from now", () => {
    expect(getInstallerPushSmsFallbackCutoff(new Date("2026-06-11T05:00:00.000Z"))).toEqual(
      new Date("2026-06-11T00:00:00.000Z"),
    );
  });

  it("formats the deadline in KST, not UTC", () => {
    // 2026-06-11T23:00Z = KST 6월 12일 08시. UTC 로 찍으면 하루 어긋난다.
    expect(formatInstallerResponseDeadline(new Date("2026-06-11T23:00:00.000Z"))).toBe(
      "6월 12일(금) 8시",
    );
  });
});
