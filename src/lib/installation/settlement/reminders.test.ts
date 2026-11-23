import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/installer/devices", () => ({ sendAssignmentPushToInstaller: vi.fn() }));
vi.mock("@/lib/popbill/client", () => ({ getCertStatus: vi.fn() }));
vi.mock("@/lib/installer/popbill-tax-invoice", () => ({ isPopbillTaxInvoiceEnabled: vi.fn() }));

const { kstDate, kstDaysBetween } = await import("./reminders");

describe("KST date helpers", () => {
  it("uses the KST calendar day", () => {
    // 2026-11-07 23:30 UTC = 2026-11-08 08:30 KST
    expect(kstDate(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-08");
  });
  it("counts days by KST date, not 24h blocks", () => {
    const now = new Date("2026-11-12T00:00:00Z"); // 09:00 KST 11-12
    expect(kstDaysBetween(now, new Date("2026-11-13T05:52:09Z"))).toBe(1); // 14:52 KST 11-13
    expect(kstDaysBetween(now, new Date("2026-12-12T00:00:00Z"))).toBe(30);
    expect(kstDaysBetween(now, new Date("2026-11-12T14:59:00Z"))).toBe(0); // 23:59 KST same day
  });
});
