import { describe, expect, it } from "vitest";
import {
  isValidCjOrderNoFormat,
  normalizeCjOrderNo,
  parseCjManifestText,
} from "@/lib/installation/cj/manifest-parse";

describe("normalizeCjOrderNo", () => {
  it("고객이 붙여넣는 공백·하이픈을 흡수한다", () => {
    expect(normalizeCjOrderNo(" 2026-0620-034905 ")).toBe("20260620034905");
  });

  it("전각 숫자를 반각으로 맞춘다", () => {
    expect(normalizeCjOrderNo("２０２６０６２０")).toBe("20260620");
  });

  it("영문이 섞여 있으면 대문자로 통일한다", () => {
    expect(normalizeCjOrderNo("cj20260620")).toBe("CJ20260620");
  });

  it("빈 값은 빈 문자열이다", () => {
    expect(normalizeCjOrderNo(null)).toBe("");
    expect(normalizeCjOrderNo(undefined)).toBe("");
  });
});

describe("isValidCjOrderNoFormat", () => {
  it("6~32자 영숫자만 통과시킨다", () => {
    expect(isValidCjOrderNoFormat("20260620034905")).toBe(true);
    expect(isValidCjOrderNoFormat("12345")).toBe(false);
    expect(isValidCjOrderNoFormat("주문번호12345")).toBe(false);
  });
});

describe("parseCjManifestText", () => {
  it("첫 번째 열만 주문번호로 읽고 나머지 열은 무시한다", () => {
    const parsed = parseCjManifestText(
      ["20260620034905,20260620,홍길동,서울", "20260620034906,20260621,김철수,부산"].join("\n"),
    );

    expect(parsed.rows).toEqual([
      { orderNo: "20260620034905", orderDate: "2026-06-20" },
      { orderNo: "20260620034906", orderDate: "2026-06-21" },
    ]);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.invalidCount).toBe(0);
  });

  it("헤더 행은 잘못된 행으로 세지 않는다", () => {
    const parsed = parseCjManifestText(["주문번호,주문일", "20260620034905,20260620"].join("\n"));

    expect(parsed.totalRows).toBe(1);
    expect(parsed.invalidCount).toBe(0);
    expect(parsed.rows).toHaveLength(1);
  });

  it("TSV 도 읽는다", () => {
    const parsed = parseCjManifestText("20260620034905\t20260620\t홍길동");

    expect(parsed.rows[0]).toEqual({ orderNo: "20260620034905", orderDate: "2026-06-20" });
  });

  it("같은 파일에 중복된 주문번호가 있으면 한 번만 남긴다", () => {
    const parsed = parseCjManifestText(
      ["20260620034905", "2026-0620-034905", "20260620034906"].join("\n"),
    );

    expect(parsed.rows.map((row) => row.orderNo)).toEqual(["20260620034905", "20260620034906"]);
  });

  it("형식이 어긋난 행은 세되 건너뛴다", () => {
    const parsed = parseCjManifestText(["20260620034905", "abc", "!!!!"].join("\n"));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.totalRows).toBe(3);
    expect(parsed.invalidCount).toBe(2);
  });

  it("두 번째 열이 날짜가 아니면 주문일 없이 받는다", () => {
    const parsed = parseCjManifestText("20260620034905,홍길동");

    expect(parsed.rows[0]).toEqual({ orderNo: "20260620034905", orderDate: null });
  });

  it("따옴표로 감싼 CSV 셀을 벗겨낸다", () => {
    const parsed = parseCjManifestText('"20260620034905","20260620"');

    expect(parsed.rows[0]).toEqual({ orderNo: "20260620034905", orderDate: "2026-06-20" });
  });
});
