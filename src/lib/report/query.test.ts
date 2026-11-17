import { afterEach, describe, expect, it } from "vitest";
import { dateRange, isReportAuthorized, pageArgs, parseReportQuery, toCsv } from "@/lib/report/query";

function parse(qs: string) {
  return parseReportQuery(new URLSearchParams(qs));
}

describe("isReportAuthorized", () => {
  afterEach(() => {
    delete process.env.REPORT_API_KEY;
  });

  it("키가 설정돼 있지 않으면 어떤 헤더도 거부한다", () => {
    expect(isReportAuthorized("Bearer ")).toBe(false);
    expect(isReportAuthorized(null)).toBe(false);
  });

  it("Bearer <키> 만 통과시킨다", () => {
    process.env.REPORT_API_KEY = "k".repeat(40);
    expect(isReportAuthorized(`Bearer ${"k".repeat(40)}`)).toBe(true);
    expect(isReportAuthorized("Bearer wrong")).toBe(false);
    expect(isReportAuthorized("k".repeat(40))).toBe(false);
  });
});

describe("parseReportQuery", () => {
  it("기본값: 1페이지, 1000행, json, 기간 없음", () => {
    const { query } = parse("");
    expect(query).toEqual({ from: null, to: null, page: 1, pageSize: 1000, format: "json" });
    expect(dateRange(query!)).toBeUndefined();
  });

  it("from/to 를 KST 하루 전체로 바꾼다", () => {
    const { query } = parse("from=2026-11-01&to=2026-11-30");
    expect(query!.from!.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(query!.to!.toISOString()).toBe("2026-11-30T14:59:59.999Z");
    expect(dateRange(query!)).toEqual({ gte: query!.from, lte: query!.to });
  });

  it("잘못된 값은 400 용 에러 문구를 돌려준다", () => {
    expect(parse("from=2026-02-31").error).toMatch(/from/);
    expect(parse("to=20261101").error).toMatch(/to/);
    expect(parse("page=0").error).toMatch(/page/);
    expect(parse("page_size=1001").error).toMatch(/page_size/);
    expect(parse("format=xlsx").error).toMatch(/format/);
  });

  it("페이지를 skip/take 로 바꾼다", () => {
    expect(pageArgs(parse("page=3&page_size=50").query!)).toEqual({ skip: 100, take: 50 });
  });
});

describe("toCsv", () => {
  it("BOM, 따옴표 이스케이프, 날짜·null 처리", () => {
    const csv = toCsv([
      { a: 'x,"y"', b: null, c: new Date("2026-11-17T00:00:00Z"), d: 3 },
    ]);
    expect(csv).toBe('﻿a,b,c,d\r\n"x,""y""",,2026-11-17T00:00:00.000Z,3\r\n');
  });

  it("행이 없으면 BOM 만", () => {
    expect(toCsv([])).toBe("﻿");
  });
});
