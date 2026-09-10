import { describe, expect, it } from "vitest";
import {
  classifyPhone,
  firstPhone,
  normalizeAddressKey,
  normalizeErpDocNo,
  normalizeInstallDate,
  normalizeServiceFee,
  parseAsHistoryRecords,
} from "@/lib/backoffice/as-history-import";

const row = (over: Record<string, string> = {}) => ({
  "일자-No.": "26/09/04 -7",
  고객명: "박형연",
  연락처: "010-8291-9944",
  주소: "서울특별시 구로구 항동로 43",
  설치일자: "260903",
  용역비: "80000",
  품목명: "K100도어락설치",
  거래처명: "경기열쇠상사",
  담당기사: "",
  진행상태: "지급완료",
  "거래처 메모 및 적요": "용역 출장비 x1",
  ...over,
});

describe("normalizeInstallDate", () => {
  it("ERP 표기 4종을 YYYY-MM-DD 로 모은다", () => {
    expect(normalizeInstallDate("260903")).toBe("2026-09-03");
    expect(normalizeInstallDate("20260903")).toBe("2026-09-03");
    expect(normalizeInstallDate("2026-09-03")).toBe("2026-09-03");
    expect(normalizeInstallDate("26.09.03")).toBe("2026-09-03");
  });

  it("꼬리 메모가 붙어도 날짜만 읽는다", () => {
    expect(normalizeInstallDate("2026-09-03 (9월정산)")).toBe("2026-09-03");
  });

  it("날짜가 아닌 값은 버린다", () => {
    expect(normalizeInstallDate("")).toBeNull();
    expect(normalizeInstallDate("미정")).toBeNull();
    expect(normalizeInstallDate("20261303")).toBeNull();
  });
});

describe("firstPhone / classifyPhone", () => {
  it("한 칸에 번호가 여럿이면 기사가 걸 수 있는 번호를 고른다", () => {
    expect(firstPhone("0503-1234-5678 / 010-1111-2222")).toBe("01011112222");
  });

  it("안심번호만 있으면 그거라도 남긴다", () => {
    const phone = firstPhone("0503-1234-5678");
    expect(phone).toBe("050312345678");
    expect(classifyPhone(phone)).toBe("SAFE");
  });

  it("실번호와 안심번호를 구분한다", () => {
    expect(classifyPhone("01082919944")).toBe("MOBILE");
    expect(classifyPhone("050312345678")).toBe("SAFE");
    expect(classifyPhone("0212345678")).toBe("OTHER");
  });
});

describe("normalizeAddressKey", () => {
  it("시도 별칭과 공백 차이를 흡수한다", () => {
    expect(normalizeAddressKey("서울특별시 구로구 항동로 43")).toBe(
      normalizeAddressKey("서울 구로구 항동로43"),
    );
    expect(normalizeAddressKey("경기도 용인시 기흥구 1")).toBe(normalizeAddressKey("경기 용인시 기흥구 1"));
  });

  it("다른 세대는 다른 키가 된다", () => {
    expect(normalizeAddressKey("서울 구로구 항동로 43 101동 101호")).not.toBe(
      normalizeAddressKey("서울 구로구 항동로 43 101동 102호"),
    );
  });
});

describe("normalizeErpDocNo / normalizeServiceFee", () => {
  it("전표번호의 사람이 넣은 공백만 걷어낸다", () => {
    expect(normalizeErpDocNo("26/09/04 -7")).toBe("26/09/04-7");
  });

  it("용역비를 정수로 읽는다", () => {
    expect(normalizeServiceFee("80,000원")).toBe(80000);
    expect(normalizeServiceFee("")).toBeNull();
  });
});

describe("parseAsHistoryRecords", () => {
  it("한 행을 통째로 정규화한다", () => {
    const { rows, skipped } = parseAsHistoryRecords([row()]);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({
      erpDocNo: "26/09/04-7",
      installDate: "2026-09-03",
      customerName: "박형연",
      customerPhone: "01082919944",
      phoneKind: "MOBILE",
      vendorName: "경기열쇠상사",
      installerNameRaw: null,
      serviceFee: 80000,
      erpStatus: "지급완료",
    });
  });

  it("전표번호가 없으면 버린다 — upsert 키가 없으면 재업로드 때 중복만 쌓인다", () => {
    const { rows, skipped } = parseAsHistoryRecords([row({ "일자-No.": "" })]);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("같은 파일 안에 전표번호가 겹치면 뒤엣것만 남긴다", () => {
    const { rows } = parseAsHistoryRecords([row({ 용역비: "50000" }), row({ 용역비: "90000" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].serviceFee).toBe(90000);
  });
});
