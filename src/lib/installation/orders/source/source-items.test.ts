import { describe, expect, it } from "vitest";
import {
  formatSourceItemsProductSummary,
  inferDispatchRequirementFromMemo,
  parseRequiredCapabilitiesText,
  parseSourceItemsJsonText,
  resolveDispatchRequirementFromSourceItems,
  serializeRequiredCapabilities,
} from "@/lib/installation/orders/source/source-items";

describe("source item dispatch requirements", () => {
  it("derives doorlock and Aqara app requirements from ERP source items and ERP requirement fields", () => {
    const items = parseSourceItemsJsonText(
      '[{"item_code":"00012-1","item_name":"용역 도어락 설치비(K100)","quantity":1},{"item_code":"00010","item_name":"용역 출장비","quantity":1}]',
    );

    expect(resolveDispatchRequirementFromSourceItems({
      items,
      requiredAqaraAppCapability: "DOORLOCK_AND_APP",
    })).toEqual({
      requiredCapabilities: ["DOORLOCK"],
      requiredAqaraAppCapability: "DOORLOCK_AND_APP",
    });
  });

  it("adds wallpad capability when ERP source items include RF447", () => {
    const items = parseSourceItemsJsonText(
      '[{"item_code":"00012-1","item_name":"용역 도어락 설치비(K100)","quantity":1},{"item_code":"RF447","item_name":"월패드 연동(RF447)","quantity":1}]',
    );

    expect(resolveDispatchRequirementFromSourceItems({ items })).toEqual({
      requiredCapabilities: ["DOORLOCK", "WALLPAD_HUB"],
      requiredAqaraAppCapability: "NONE",
    });
  });

  it("treats any ERP 00012-prefixed install item as a doorlock capability", () => {
    const items = parseSourceItemsJsonText(
      '[{"item_code":"00012-9","item_name":"용역 도어락 설치비(신규)","quantity":1},{"item_code":"00010","item_name":"용역 출장비","quantity":1}]',
    );

    expect(resolveDispatchRequirementFromSourceItems({ items })).toEqual({
      requiredCapabilities: ["DOORLOCK"],
      requiredAqaraAppCapability: "NONE",
    });
  });

  it("round-trips required capabilities text safely", () => {
    expect(parseRequiredCapabilitiesText(serializeRequiredCapabilities(["DOORLOCK", "DOORLOCK"]))).toEqual([
      "DOORLOCK",
    ]);
    expect(parseRequiredCapabilitiesText(null)).toEqual([]);
    expect(parseRequiredCapabilitiesText("{}")).toEqual([]);
    expect(parseRequiredCapabilitiesText("not-json")).toEqual([]);
  });

  it("normalizes unknown Aqara app requirement values to NONE", () => {
    expect(
      resolveDispatchRequirementFromSourceItems({
        items: [],
        requiredAqaraAppCapability: "REQUIRED",
      }),
    ).toEqual({
      requiredCapabilities: [],
      requiredAqaraAppCapability: "NONE",
    });
  });

  it("parses source items defensively and normalizes numeric quantities", () => {
    expect(parseSourceItemsJsonText(null)).toEqual([]);
    expect(parseSourceItemsJsonText("{}")).toEqual([]);
    expect(parseSourceItemsJsonText("not-json")).toEqual([]);
    expect(
      parseSourceItemsJsonText(
        '[null,{"item_code":" rf447 ","item_name":" 월패드 ","quantity":"2"},{"item_code":"","item_name":"","quantity":"NaN"}]',
      ),
    ).toEqual([
      {
        item_code: "rf447",
        item_name: "월패드",
        quantity: 2,
      },
      {
        item_code: null,
        item_name: null,
        quantity: null,
      },
    ]);
  });

  it("formats source item product summaries with quantity defaults and fallback text", () => {
    expect(
      formatSourceItemsProductSummary(
        '[{"item_name":" K100 도어락 ","quantity":0},{"item_name":"월패드","quantity":3},{"item_name":"   ","quantity":1}]',
        "fallback memo",
      ),
    ).toBe("K100 도어락 x1 / 월패드 x3");
    expect(formatSourceItemsProductSummary("[]", " fallback memo ")).toBe("fallback memo");
    expect(formatSourceItemsProductSummary("not-json", null)).toBe("");
  });

  it("infers dispatch requirements from legacy source memo text", () => {
    expect(inferDispatchRequirementFromMemo("Aqara K100 앱+허브 설치 / 월패드 연동")).toEqual({
      requiredCapabilities: ["DOORLOCK", "WALLPAD_HUB"],
      requiredAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
    });
    expect(inferDispatchRequirementFromMemo("도어락 앱 설치")).toEqual({
      requiredCapabilities: ["DOORLOCK"],
      requiredAqaraAppCapability: "DOORLOCK_AND_APP",
    });
    expect(inferDispatchRequirementFromMemo(null)).toEqual({
      requiredCapabilities: [],
      requiredAqaraAppCapability: "NONE",
    });
  });
});
