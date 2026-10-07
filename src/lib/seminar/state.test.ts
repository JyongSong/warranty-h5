import { describe, expect, it } from "vitest";
import {
  buildSeminarConfirmationSms,
  formatSeminarDateTime,
  isPastSeminarDeadline,
  maskInstallerName,
  parseSeminarContacts,
  resolveSeminarState,
} from "./state";

const closesAt = new Date("2026-10-16T16:00:00+09:00");
const seminar = { capacity: 35, closesAt, manuallyClosed: false };
const before = new Date("2026-10-16T15:59:59+09:00");

describe("resolveSeminarState", () => {
  it("is open while seats remain before the deadline", () => {
    expect(resolveSeminarState(seminar, 0, before)).toBe("OPEN");
    expect(resolveSeminarState(seminar, 34, before)).toBe("OPEN");
  });

  it("is full once active registrations reach capacity", () => {
    expect(resolveSeminarState(seminar, 35, before)).toBe("FULL");
    expect(resolveSeminarState(seminar, 36, before)).toBe("FULL");
  });

  it("closes exactly at the deadline even with seats left", () => {
    expect(resolveSeminarState(seminar, 0, closesAt)).toBe("CLOSED");
    expect(isPastSeminarDeadline(seminar, closesAt)).toBe(true);
    expect(isPastSeminarDeadline(seminar, before)).toBe(false);
  });

  it("reports a manual close ahead of being full", () => {
    expect(resolveSeminarState({ ...seminar, manuallyClosed: true }, 35, before)).toBe("CLOSED");
  });

  it("never closes by time when no deadline is set", () => {
    const open = { ...seminar, closesAt: null };
    expect(isPastSeminarDeadline(open, new Date("2030-01-01T00:00:00Z"))).toBe(false);
    expect(resolveSeminarState(open, 1, new Date("2030-01-01T00:00:00Z"))).toBe("OPEN");
  });
});

describe("maskInstallerName", () => {
  it("keeps only the first and last characters", () => {
    expect(maskInstallerName("김철수")).toBe("김*수");
    expect(maskInstallerName("남궁민수")).toBe("남**수");
    expect(maskInstallerName("김철")).toBe("김*");
    expect(maskInstallerName(" 김 ")).toBe("김");
    expect(maskInstallerName("")).toBe("");
  });
});

describe("formatSeminarDateTime", () => {
  it("formats in KST regardless of the server time zone", () => {
    expect(formatSeminarDateTime(new Date("2026-10-16T07:00:00Z"))).toBe("2026-10-16 16:00");
    expect(formatSeminarDateTime(new Date("2026-10-16T15:30:00Z"))).toBe("2026-10-17 00:30");
  });
});

describe("buildSeminarConfirmationSms", () => {
  it("includes the schedule, venue and cancel link", () => {
    const text = buildSeminarConfirmationSms({
      installerName: "김철수",
      title: "아카라 도어락 파트너 세미나",
      scheduleText: "10월 17일(토) 09:00~12:00",
      venue: "서울시 금천구 대륭테크노타운 6차 702호",
      link: "https://example.com/i/s/l100se",
    });

    expect(text.startsWith("[아카라 도어락 파트너 세미나]\n김철수 기사님")).toBe(true);
    expect(text).toContain("■ 일시: 10월 17일(토) 09:00~12:00");
    expect(text).toContain("■ 장소: 서울시 금천구 대륭테크노타운 6차 702호");
    expect(text.endsWith("https://example.com/i/s/l100se")).toBe(true);
  });
});

describe("parseSeminarContacts", () => {
  it("pairs comma-separated names and phones in order", () => {
    expect(parseSeminarContacts("김시열, 김동수", "01099614937, 010-2245-2222")).toEqual([
      { name: "김시열", phone: "01099614937" },
      { name: "김동수", phone: "01022452222" },
    ]);
  });

  it("handles a single contact, a missing name and no contact", () => {
    expect(parseSeminarContacts("김시열", "01099614937")).toEqual([{ name: "김시열", phone: "01099614937" }]);
    expect(parseSeminarContacts(null, "01099614937")).toEqual([{ name: "", phone: "01099614937" }]);
    expect(parseSeminarContacts("김시열", null)).toEqual([]);
  });
});
