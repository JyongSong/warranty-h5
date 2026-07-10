import { describe, expect, test } from "vitest";
import {
  formatBackofficeDateTime,
  formatBackofficePhone,
  formatBackofficeText,
  formatJsonArrayObjects,
} from "./table-formatting";

describe("backoffice table formatting", () => {
  test("formats phone numbers with hyphens", () => {
    expect(formatBackofficePhone("01012345678")).toBe("010-1234-5678");
    expect(formatBackofficePhone("050311112222")).toBe("0503-1111-2222");
    expect(formatBackofficePhone("0212345678")).toBe("021-234-5678");
    expect(formatBackofficePhone(null)).toBe("-");
  });

  test("formats date-time values as yyyy-mm-dd hh:mm", () => {
    expect(formatBackofficeDateTime("2026-06-16T05:07:30.000Z")).toBe("2026-06-16 14:07");
    expect(formatBackofficeDateTime("2026-06-16T14:07")).toBe("2026-06-16 14:07");
    expect(formatBackofficeDateTime("20260616")).toBe("2026-06-16");
    expect(formatBackofficeDateTime(null)).toBe("-");
  });

  test("formats array JSON as one object per line", () => {
    expect(
      formatJsonArrayObjects(
        '[{"item_code":"00012","item_name":"K100","quantity":1},{"item_code":"00010","item_name":"출장비","quantity":1}]',
      ),
    ).toBe("00012 | K100 | 1\n00010 | 출장비 | 1");
  });

  test("keeps blank values as a dash", () => {
    expect(formatBackofficeText("   ")).toBe("-");
    expect(formatJsonArrayObjects("not-json")).toBe("not-json");
  });
});
