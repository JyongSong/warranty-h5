import { describe, expect, it } from "vitest";
import { splitInstallationSourceAddress } from "@/lib/installation/customer/address-parser";

// "주문정보와 동일" 이 주문 주소를 기본/상세로 나눠 채우는 근거.
// 통째로 기본 주소에 넣으면 상세 주소가 비어 제출 버튼이 계속 잠긴다(필수 항목).
describe("주문 주소 분리", () => {
  const cases = [
    {
      source: "경기도 화성시 동탄신리천로1길 74 1911동 1103호(목동, 호반써밋)",
      main: "경기도 화성시 동탄신리천로1길 74",
      detail: "1911동 1103호(목동, 호반써밋)",
    },
    {
      source: "서울 강남구 테헤란로 1 12층 1201호",
      main: "서울 강남구 테헤란로 1",
      detail: "12층 1201호",
    },
    {
      source: "경남 진주시 초전북로62번길 32 더하임403호",
      main: "경남 진주시 초전북로62번길 32",
      detail: "더하임403호",
    },
  ];

  for (const { source, main, detail } of cases) {
    it(`splits ${source}`, () => {
      const split = splitInstallationSourceAddress(source);
      expect(split?.addressMain).toBe(main);
      expect(split?.addressDetail).toBe(detail);
      // 폼의 필수 조건(기본 5자 이상 + 상세 비어있지 않음)을 만족해야 한다.
      expect((split?.addressMain ?? "").trim().length).toBeGreaterThanOrEqual(5);
      expect((split?.addressDetail ?? "").trim().length).toBeGreaterThan(0);
    });
  }
});
