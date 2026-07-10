import { describe, expect, it } from "vitest";
import {
  buildDefaultHistoryDateRange,
  normalizeHistoryDateRangeSearchParams,
  toStatusChangedAtRange,
} from "./history-date-range";

describe("history date range", () => {
  it("defaults to the recent 30 KST calendar days including today", () => {
    expect(buildDefaultHistoryDateRange(new Date("2026-06-22T03:00:00.000Z"))).toEqual({
      from: "2026-05-24",
      to: "2026-06-22",
    });
  });

  it("normalizes valid search params", () => {
    expect(
      normalizeHistoryDateRangeSearchParams(
        {
          from: "2026-06-01",
          to: "2026-06-15",
        },
        new Date("2026-06-22T03:00:00.000Z"),
      ),
    ).toEqual({
      from: "2026-06-01",
      to: "2026-06-15",
    });
  });

  it("falls back to the default range when dates are invalid or reversed", () => {
    expect(
      normalizeHistoryDateRangeSearchParams(
        {
          from: "2026-06-20",
          to: "2026-06-01",
        },
        new Date("2026-06-22T03:00:00.000Z"),
      ),
    ).toEqual({
      from: "2026-05-24",
      to: "2026-06-22",
    });
  });

  it("converts date-only filters to an inclusive KST day range", () => {
    expect(toStatusChangedAtRange({ from: "2026-06-01", to: "2026-06-15" })).toEqual({
      statusChangedFrom: new Date("2026-05-31T15:00:00.000Z"),
      statusChangedTo: new Date("2026-06-15T15:00:00.000Z"),
    });
  });
});
