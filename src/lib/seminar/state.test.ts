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
  // SMS 는 EUC-KR 기준 90바이트까지다. 한글은 2바이트, 그 밖은 1바이트로 센다.
  const smsBytes = (text: string) =>
    Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 0x7f ? 2 : 1), 0);
  const link = "https://aqaralife-service.kr/i/s/1017";

  it("names the installer and ends with the cancel link", () => {
    expect(buildSeminarConfirmationSms({ installerName: "김철수", link })).toBe(
      `[아카라] 김철수님 세미나 참석 신청 완료\n취소: ${link}`,
    );
  });

  it("fits in a single SMS for names up to four characters", () => {
    expect(smsBytes(buildSeminarConfirmationSms({ installerName: "김철수", link }))).toBe(83);
    expect(smsBytes(buildSeminarConfirmationSms({ installerName: "남궁민수", link }))).toBeLessThanOrEqual(90);
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
