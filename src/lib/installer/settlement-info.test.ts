import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/backoffice/system-settings", () => ({ SYSTEM_SETTING_KEYS: {}, isSystemSettingEnabled: async () => false }));
vi.mock("@/lib/installer/storage", () => ({
  installerDocPrefix: (id: string) => `installer-docs/${id}/`,
  findMissingPhotos: async () => [],
  getCompletionPhotoSignedUrls: async () => [],
}));

import { SettlementInfoError, isValidBusinessNumber, parseSettlementInfoInput } from "./settlement-info";

const base = {
  taxDocType: "CASH_RECEIPT",
  businessNumber: "220-81-62517",
  businessName: "테스트상사",
  representativeName: "홍길동",
  invoiceEmail: "",
  bankName: "국민은행",
  accountNumber: "123-456-789012",
  accountHolder: "홍길동",
  businessLicensePhotoPath: "installer-docs/inst-1/a.jpg",
  bankbookPhotoPath: "installer-docs/inst-1/b.jpg",
};

describe("isValidBusinessNumber", () => {
  it("accepts real-format numbers", () => {
    expect(isValidBusinessNumber("2208162517")).toBe(true);
    expect(isValidBusinessNumber("1248100998")).toBe(true);
  });
  it("rejects wrong check digit / length", () => {
    expect(isValidBusinessNumber("2208162518")).toBe(false);
    expect(isValidBusinessNumber("220816251")).toBe(false);
  });
});

describe("parseSettlementInfoInput", () => {
  it("normalizes business number to digits", () => {
    expect(parseSettlementInfoInput("inst-1", base).businessNumber).toBe("2208162517");
  });
  it("does not require email for 세금계산서", () => {
    expect(parseSettlementInfoInput("inst-1", { ...base, taxDocType: "E_TAX_INVOICE" }).invoiceEmail).toBeNull();
  });
  it("rejects a malformed email", () => {
    expect(() => parseSettlementInfoInput("inst-1", { ...base, invoiceEmail: "not-an-email" })).toThrow(
      new SettlementInfoError("EMAIL_INVALID"),
    );
  });
  it("rejects photo paths of another installer", () => {
    expect(() =>
      parseSettlementInfoInput("inst-1", { ...base, bankbookPhotoPath: "installer-docs/inst-2/b.jpg" }),
    ).toThrow(new SettlementInfoError("PHOTO_REQUIRED"));
  });
  it("ignores tax doc type while the selection is hidden, keeping the stored value", () => {
    const hidden = { taxDocTypeEnabled: false, keepTaxDocType: "PAPER_TAX_INVOICE" as const };
    expect(parseSettlementInfoInput("inst-1", { ...base, taxDocType: "" }, hidden).taxDocType).toBe("PAPER_TAX_INVOICE");
    expect(parseSettlementInfoInput("inst-1", { ...base, taxDocType: "" }, { taxDocTypeEnabled: false }).taxDocType).toBeNull();
  });
});
