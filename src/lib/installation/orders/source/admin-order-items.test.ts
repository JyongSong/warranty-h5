import { describe, expect, it } from "vitest";
import { deriveInstallItemsFromMemo } from "@/lib/installation/partner/install-items";
import { inferDispatchRequirementFromMemo } from "@/lib/installation/orders/source/source-items";
import {
  ADMIN_ORDER_ITEM_CUSTOM,
  ADMIN_ORDER_ITEM_OPTIONS,
  AdminOrderItemsError,
  buildAdminOrderItemsMemo,
} from "@/lib/installation/orders/source/admin-order-items";

describe("buildAdminOrderItemsMemo", () => {
  it("writes ERP-style memo that dispatch and installer items understand", () => {
    const memo = buildAdminOrderItemsMemo([
      { option: "K100", quantity: 1 },
      { option: "WALLPAD", quantity: 1 },
    ]);
    expect(memo).toBe("용역 도어락 설치비(K100) x1 / 용역 월패드 모듈 설치 x1");
    expect(inferDispatchRequirementFromMemo(memo).requiredCapabilities.sort()).toEqual(["DOORLOCK", "WALLPAD_HUB"]);
    expect(deriveInstallItemsFromMemo(memo).map((item) => item.code)).toEqual(["00049"]);
  });

  it.each([
    ["K100", "00050"],
    ["L100", "00047"],
    ["U100", "00051"],
    ["K100_WALLPAD", "00049"],
    ["L100_WALLPAD", "00048"],
    ["WALLPAD", "00046"],
    ["DOORLOCK_RESTORE", "00060"],
    ["DOORBELL", "00054"],
    ["CURTAIN_RAIL", "00052"],
    ["LIGHT_SWITCH", "00053"],
  ])("maps %s to catalog item %s", (option, code) => {
    const memo = buildAdminOrderItemsMemo([{ option, quantity: 2 }]);
    expect(deriveInstallItemsFromMemo(memo)).toEqual([expect.objectContaining({ code, quantity: 2 })]);
  });

  it("covers every dropdown option in the mapping test", () => {
    expect(ADMIN_ORDER_ITEM_OPTIONS).toHaveLength(10);
  });

  it("keeps custom items as named service items and strips memo separators", () => {
    const memo = buildAdminOrderItemsMemo([{ option: ADMIN_ORDER_ITEM_CUSTOM, customName: " 현관 / 센서 교체 x3 ", quantity: 1 }]);
    expect(memo).toBe("용역 현관 센서 교체 x1");
    expect(deriveInstallItemsFromMemo(memo)).toEqual([
      { code: null, name: "현관 센서 교체", quantity: 1, onsitePayment: false },
    ]);
  });

  it("rejects empty lists, bad quantities, unknown options and empty custom names", () => {
    expect(() => buildAdminOrderItemsMemo([])).toThrow(AdminOrderItemsError);
    expect(() => buildAdminOrderItemsMemo([{ option: "K100", quantity: 0 }])).toThrow("INSTALL_ITEM_QUANTITY_INVALID");
    expect(() => buildAdminOrderItemsMemo([{ option: "NOPE", quantity: 1 }])).toThrow("INSTALL_ITEM_INVALID");
    expect(() => buildAdminOrderItemsMemo([{ option: ADMIN_ORDER_ITEM_CUSTOM, customName: " ", quantity: 1 }])).toThrow(
      "INSTALL_ITEM_NAME_REQUIRED",
    );
  });
});
