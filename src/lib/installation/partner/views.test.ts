import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/installer/storage", () => ({ getCompletionPhotoSignedUrls: vi.fn() }));

import { normalizePartnerCompletedRange } from "@/lib/installation/partner/views";

describe("partner completed range", () => {
  // 2026-10-28 09:30 KST
  const now = new Date("2026-10-28T00:30:00Z");

  it("defaults to the 1st of this month through today (KST)", () => {
    expect(normalizePartnerCompletedRange(undefined, undefined, now)).toEqual({ from: "2026-10-01", to: "2026-10-28" });
  });

  it("uses the admin's dates and swaps a reversed range", () => {
    expect(normalizePartnerCompletedRange("2026-09-01", "2026-09-30", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(normalizePartnerCompletedRange("2026-09-30", "2026-09-01", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("ignores malformed dates", () => {
    expect(normalizePartnerCompletedRange("2026-13-45", "abc", now)).toEqual({ from: "2026-10-01", to: "2026-10-28" });
  });

  it("uses KST for 'today' late at night UTC", () => {
    // 2026-10-31 23:30 UTC = 2026-11-01 08:30 KST
    expect(normalizePartnerCompletedRange(undefined, undefined, new Date("2026-10-31T23:30:00Z"))).toEqual({
      from: "2026-11-01",
      to: "2026-11-01",
    });
  });
});
