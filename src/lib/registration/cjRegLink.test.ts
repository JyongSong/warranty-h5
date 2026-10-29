import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createCjRegLinkToken, parseCjRegLinkToken } from "./cjRegLink";
import { parseCjRegLinkWorkbook } from "./cjRegLinkWorkbook";

const LINK = {
  orderNo: "20261015091460001001001",
  userPhone: "01055193568",
  shipDate: "2026-10-16",
  installerPhone: "01022452222",
  quantity: 1,
};

describe("CJ 2년 등록 링크 토큰", () => {
  beforeEach(() => {
    process.env.MANAGEMENT_SESSION_SECRET = "test-secret";
    delete process.env.CJ_REG_LINK_SECRET;
  });

  it("만든 토큰을 그대로 읽어 낸다", () => {
    const now = Date.UTC(2026, 9, 29);
    const parsed = parseCjRegLinkToken(createCjRegLinkToken(LINK, now), now);
    expect(parsed).toEqual({ ok: true, link: { ...LINK, exp: now / 1000 + 90 * 24 * 3600 } });
  });

  it("90일이 지나면 만료로 본다", () => {
    const now = Date.UTC(2026, 9, 29);
    const token = createCjRegLinkToken(LINK, now);
    expect(parseCjRegLinkToken(token, now + 89 * 24 * 3600 * 1000).ok).toBe(true);
    expect(parseCjRegLinkToken(token, now + 90 * 24 * 3600 * 1000)).toEqual({
      ok: false,
      error: "LINK_EXPIRED",
    });
  });

  it("전화번호를 바꿔 끼운 토큰은 받지 않는다", () => {
    const [, signature] = createCjRegLinkToken(LINK).split(".");
    const forged = Buffer.from(
      JSON.stringify({ o: LINK.orderNo, p: "01099999999", d: LINK.shipDate, q: 1, e: 9999999999 }),
    ).toString("base64url");
    expect(parseCjRegLinkToken(`${forged}.${signature}`)).toEqual({ ok: false, error: "INVALID_LINK" });
  });

  it("다른 비밀값으로 서명된 토큰은 받지 않는다", () => {
    const token = createCjRegLinkToken(LINK);
    process.env.MANAGEMENT_SESSION_SECRET = "other-secret";
    expect(parseCjRegLinkToken(token)).toEqual({ ok: false, error: "INVALID_LINK" });
  });

  it("업체 연락처가 없으면 null 로 돌려준다", () => {
    const parsed = parseCjRegLinkToken(createCjRegLinkToken({ ...LINK, installerPhone: null }));
    expect(parsed.ok && parsed.link.installerPhone).toBeNull();
  });
});

describe("CJ 배정 엑셀 읽기", () => {
  function workbook(rows: Record<string, unknown>[]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "A S수리입력");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  it("지점명으로 업체 연락처를 찾고, 같은 주문은 수량을 합친다", () => {
    const result = parseCjRegLinkWorkbook(
      workbook([
        { 출고일자: "2026/10/16", 주문번호: LINK.orderNo, 연락처: "010-5519-3568", 지점명: "경기열쇠상사", 수량: 1 },
        { 출고일자: "2026/10/16", 주문번호: LINK.orderNo, 연락처: "010-5519-3568", 지점명: "경기열쇠상사", 수량: 1 },
        { 출고일자: "2026/10/17", 주문번호: "20261015000000001001001", 연락처: "010-1111-2222", 지점명: "안산/24시열쇠나라", 수량: 1 },
        { 출고일자: "", 주문번호: "1", 연락처: "010-1111-3333", 지점명: "키플레이", 수량: 1 },
      ]),
    );

    expect(result.skipped).toBe(1);
    expect(result.rows).toEqual([
      { ...LINK, branchName: "경기열쇠상사", quantity: 2 },
      {
        orderNo: "20261015000000001001001",
        userPhone: "01011112222",
        shipDate: "2026-10-17",
        branchName: "안산/24시열쇠나라",
        installerPhone: null,
        quantity: 1,
      },
    ]);
  });
});
