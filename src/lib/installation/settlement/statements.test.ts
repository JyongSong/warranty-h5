import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/installer/devices", () => ({ sendAssignmentPushToInstaller: async () => 0 }));
vi.mock("@/lib/installer/storage", () => ({}));
vi.mock("@/lib/backoffice/system-settings", () => ({ SYSTEM_SETTING_KEYS: {}, getSystemSettingValue: async () => null, isSystemSettingEnabled: async () => false }));

import { computeAmounts, flowOf, payBlockReason, ymBounds } from "./statements";

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
  const base = { flow: "TAX" as const, evidenceStatus: "CONFIRMED" as const, paidAt: null, infoStatus: "APPROVED" };
  it("allows paying confirmed tax invoices", () => expect(payBlockReason(base)).toBeNull());
  it("blocks tax invoices before confirmation", () =>
    expect(payBlockReason({ ...base, evidenceStatus: "SUBMITTED" })).not.toBeNull());
  it("allows cash receipts before evidence", () =>
    expect(payBlockReason({ ...base, flow: "CASH", evidenceStatus: "PENDING" })).toBeNull());
  it("blocks when settlement info is not approved", () =>
    expect(payBlockReason({ ...base, infoStatus: "SUBMITTED" })).not.toBeNull());
});
