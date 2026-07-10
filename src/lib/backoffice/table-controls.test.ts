import { describe, expect, test } from "vitest";
import {
  buildBackofficeTableHref,
  getBackofficeTableColumnHeaderLabel,
  getBackofficeTableLeafColumnIds,
  normalizeTablePreferenceColumnOrder,
  normalizeTablePreferenceSorting,
  parseTablePreferences,
  normalizeBackofficeTableParams,
  reorderColumnIds,
  stringifyTablePreferences,
} from "./table-controls";

describe("backoffice table controls", () => {
  test("normalizes page and page size search params", () => {
    expect(normalizeBackofficeTableParams({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
      skip: 100,
    });

    expect(normalizeBackofficeTableParams({ page: "-1", pageSize: "999" })).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
    });
  });

  test("builds table links while preserving unrelated filters", () => {
    expect(
      buildBackofficeTableHref("/backoffice/installations", {
        currentParams: { q: "홍길동", view: "assignment-requests", page: "4", pageSize: "20" },
        page: 2,
        pageSize: 50,
      }),
    ).toBe(
      "/backoffice/installations?q=%ED%99%8D%EA%B8%B8%EB%8F%99&view=assignment-requests&page=2&pageSize=50",
    );
  });

  test("moves a dragged column before the drop target", () => {
    expect(reorderColumnIds(["order", "memo", "phone", "status"], "phone", "memo")).toEqual([
      "order",
      "phone",
      "memo",
      "status",
    ]);
  });

  test("parses persisted table preferences defensively", () => {
    expect(
      parseTablePreferences(
        JSON.stringify({
          columnVisibility: { memo: false },
          columnOrder: ["memo", "order"],
          columnSizing: { memo: 480 },
          sorting: [{ id: "memo", desc: true }],
        }),
      ),
    ).toEqual({
      columnVisibility: { memo: false },
      columnOrder: ["memo", "order"],
      columnSizing: { memo: 480 },
      sorting: [{ id: "memo", desc: true }],
    });

    expect(parseTablePreferences("not-json")).toEqual({});
  });

  test("keeps saved column order compatible with current columns", () => {
    expect(normalizeTablePreferenceColumnOrder(["memo", "removed", "order"], ["order", "memo", "phone"])).toEqual([
      "memo",
      "order",
      "phone",
    ]);
  });

  test("keeps locked leading columns before saved user column order", () => {
    expect(
      normalizeTablePreferenceColumnOrder(
        ["memo", "order", "selection"],
        ["selection", "order", "memo", "phone"],
        ["selection"],
      ),
    ).toEqual(["selection", "memo", "order", "phone"]);
  });

  test("keeps saved sorting compatible with current columns", () => {
    expect(
      normalizeTablePreferenceSorting(
        [
          { id: "installDate", desc: false },
          { id: "statusChangedAt", desc: true },
        ],
        ["erpOrderNo", "statusChangedAt"],
      ),
    ).toEqual([{ id: "statusChangedAt", desc: true }]);
  });

  test("extracts leaf column ids from accessor keys and nested columns", () => {
    expect(
      getBackofficeTableLeafColumnIds([
        { accessorKey: "order", header: "주문" },
        {
          id: "customerGroup",
          header: "고객",
          columns: [
            { id: "customerName", accessorFn: () => "", header: "고객명" },
            { accessorKey: "phone", header: "전화번호" },
          ],
        },
      ]),
    ).toEqual(["order", "customerName", "phone"]);
  });

  test("uses a fallback label for non-string column headers", () => {
    expect(getBackofficeTableColumnHeaderLabel("주문번호")).toBe("주문번호");
    expect(getBackofficeTableColumnHeaderLabel(() => null)).toBe("컬럼");
  });

  test("stringifies table preferences", () => {
    expect(
      stringifyTablePreferences({
        columnVisibility: { memo: false },
        columnOrder: ["memo", "order"],
        columnSizing: { memo: 480 },
        sorting: [{ id: "memo", desc: false }],
      }),
    ).toBe(
      '{"columnVisibility":{"memo":false},"columnOrder":["memo","order"],"columnSizing":{"memo":480},"sorting":[{"id":"memo","desc":false}]}',
    );
  });
});
