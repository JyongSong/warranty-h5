import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/installer/devices", () => ({ sendAssignmentPushToInstaller: async () => 0 }));
vi.mock("@/lib/installer/storage", () => ({}));
vi.mock("@/lib/backoffice/system-settings", () => ({ SYSTEM_SETTING_KEYS: {}, getSystemSettingValue: async () => null, isSystemSettingEnabled: async () => false }));

import { computeAmounts, flowOf, invoiceDeadlineOf, payBlockReason, payYmOf, ymBounds } from "./statements";

describe("computeAmounts", () => {
  it("adds 10% VAT (floored) for tax invoices", () => {
    expect(computeAmounts(100000, "TAX")).toEqual({ vatAmount: 10000, payAmount: 110000 });
    expect(computeAmounts(55555, "TAX")).toEqual({ vatAmount: 5555, payAmount: 61110 });
  });
  it("pays the base amount for cash receipts", () => {
    expect(computeAmounts(100000, "CASH")).toEqual({ vatAmount: 0, payAmount: 100000 });
  });
});

describe("flowOf", () => {
  it("groups electronic and paper invoices together", () => {
    expect(flowOf("E_TAX_INVOICE")).toBe("TAX");
    expect(flowOf("PAPER_TAX_INVOICE")).toBe("TAX");
    expect(flowOf("CASH_RECEIPT")).toBe("CASH");
    expect(flowOf(null)).toBeNull();
  });
});

describe("ymBounds", () => {
  it("covers the KST calendar month", () => {
    const b = ymBounds("2026-10");
    expect(b.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(b.endExclusive.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(b.lastDate).toBe("2026-10-31");
  });
});

describe("payBlockReason", () => {
  const base = {
    flow: "TAX" as const,
    evidenceStatus: "CONFIRMED" as const,
    paidAt: null,
    infoStatus: "APPROVED",
    payDeferred: false,
    payYm: "2026-12",
  };
  it("allows paying confirmed tax invoices", () => expect(payBlockReason(base)).toBeNull());
  it("blocks tax invoices before confirmation", () =>
    expect(payBlockReason({ ...base, evidenceStatus: "SUBMITTED" })).not.toBeNull());
  it("allows cash receipts before evidence", () =>
    expect(payBlockReason({ ...base, flow: "CASH", evidenceStatus: "PENDING" })).toBeNull());
  it("blocks when settlement info is not approved", () =>
    expect(payBlockReason({ ...base, infoStatus: "SUBMITTED" })).not.toBeNull());
  it("blocks late tax invoices until the next month", () =>
    expect(payBlockReason({ ...base, payDeferred: true, payYm: "2027-01" })).toBe("기한 후 제출 · 1월 지급"));
  it("does not defer cash receipts", () =>
    expect(payBlockReason({ ...base, flow: "CASH", evidenceStatus: "PENDING", payDeferred: true })).toBeNull());
});

describe("invoice deadline (1일 발행 → 5일 기한 → 그 달 중 지급)", () => {
  const kst = (s: string) => new Date(`${s}+09:00`);
  it("statement issued on the 1st is due on the 5th of that month", () => {
    expect(invoiceDeadlineOf(kst("2026-12-01T10:00:00"))).toMatchObject({ date: "2026-12-05", payYm: "2026-12" });
  });
  it("statement issued after the 5th (late 추가 정산서) is due on the next month's 5th", () => {
    expect(invoiceDeadlineOf(kst("2026-12-20T10:00:00"))).toMatchObject({ date: "2027-01-05", payYm: "2027-01" });
  });
  it("the whole 5th day (KST) still counts as on time", () => {
    const created = kst("2026-12-01T10:00:00");
    expect(payYmOf(created, kst("2026-12-05T23:59:00"))).toBe("2026-12");
    expect(payYmOf(created, kst("2026-12-06T00:00:00"))).toBe("2027-01");
  });
  it("unsubmitted statements are projected from now", () => {
    const created = kst("2026-12-01T10:00:00");
    expect(payYmOf(created, null, kst("2026-12-03T09:00:00"))).toBe("2026-12");
    expect(payYmOf(created, null, kst("2026-12-07T09:00:00"))).toBe("2027-01");
  });
});
