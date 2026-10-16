import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { toCjDispatchRow, kstRangeToUtc, toKstYmd } = await import("@/lib/installation/cj/dispatch-rows");
const { assignDispatch } = await import("@/lib/dispatch");

const base = {
  externalOrderNo: "20260620034905",
  // 2026-10-16 23:30 KST
  submittedAt: new Date("2026-10-16T14:30:00Z"),
  installAddress: "서울 강남구 테헤란로 1",
  installAddressDetail: "101동 1001호",
  installDate: "2026-10-20",
  installTimeSlot: "오전 09:00 - 12:00",
  customerPhone: "01012345678",
  ordererPhone: "01087654321",
  customerNote: "철문이에요",
};

describe("toCjDispatchRow", () => {
  it("고객 제출값을 기사배정 행으로 옮긴다", () => {
    expect(toCjDispatchRow(base)).toEqual({
      customer_name: null,
      phone: "010-1234-5678",
      address: "서울 강남구 테헤란로 1 101동 1001호",
      order_numbers: "20260620034905",
      no_girl: null,
      due_date: "20261016",
      memo: "[CJ 온스타일] 스마트 도어락 K100 x1 / 희망 2026-10-20 오전 09:00 - 12:00 / 주문자 010-8765-4321 / 요청 철문이에요",
    });
  });

  it("비어 있는 값은 memo 에서 뺀다", () => {
    const row = toCjDispatchRow({ ...base, installTimeSlot: null, ordererPhone: null, customerNote: "  " });
    expect(row.memo).toBe("[CJ 온스타일] 스마트 도어락 K100 x1 / 희망 2026-10-20");
  });

  it("assignDispatch 가 K100 설치 품목과 강남 지점으로 분배한다", () => {
    const [assigned] = assignDispatch([toCjDispatchRow(base)]);
    expect(assigned.item_code).toBe("00050");
    expect(assigned.quantity).toBe(1);
    expect(assigned.branch_name).toBe("강남/열쇠닥터");
  });

  it("요청사항에 L100 이 적혀 있어도 품목은 K100 이다", () => {
    const [assigned] = assignDispatch([toCjDispatchRow({ ...base, customerNote: "예전에 L100 쓰던 집" })]);
    expect(assigned.item_code).toBe("00050");
  });
});

describe("KST 날짜 변환", () => {
  it("KST 하루를 UTC 구간으로 바꾼다", () => {
    expect(kstRangeToUtc("20261016", "20261016")).toEqual({
      gte: new Date("2026-10-15T15:00:00Z"),
      lt: new Date("2026-10-16T15:00:00Z"),
    });
  });

  it("UTC 자정 직전도 KST 다음 날로 센다", () => {
    expect(toKstYmd(new Date("2026-10-16T15:00:00Z"))).toBe("20261017");
  });
});
