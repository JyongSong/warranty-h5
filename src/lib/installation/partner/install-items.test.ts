import { describe, expect, it } from "vitest";
import {
  deriveInstallItemsFromMemo,
  formatInstallItemsText,
  normalizeInstallItems,
  PartnerInstallItemsError,
  resolvePartnerInstallItems,
} from "@/lib/installation/partner/install-items";

const item = (code: string | null, name: string, quantity = 1, onsitePayment = false) => ({
  code,
  name,
  quantity,
  onsitePayment,
});

describe("deriveInstallItemsFromMemo", () => {
  it("maps service items to ECOUNT 품목, dropping 출장비 and products", () => {
    expect(
      deriveInstallItemsFromMemo(
        "기타 부자재 x360 / (부자재) DC12V 컨버터 x1 / 용역 도어락 설치비(K100) x1 / 용역 도어벨 상시전원 설치비 (부자재 비용 현장 결제) x1 / 용역 출장비 x1",
      ),
    ).toEqual([item("00050", "K100도어락설치"), item("00054", "도어벨설치")]);
  });

  it("combines a K100/L100 doorlock with the 월패드 module and keeps leftovers apart", () => {
    expect(
      deriveInstallItemsFromMemo("RF 447 송수신기 모듈 x1 / 용역 커튼레일 설치비 x2 / 용역 도어락 설치비(K100) x1 / 용역 월패드 모듈 설치비 x1"),
    ).toEqual([item("00049", "K100도어락설치+월패드연동설치"), item("00052", "커튼레일 설치", 2)]);
    expect(deriveInstallItemsFromMemo("용역 도어락 설치비(L100) x2 / 용역 월패드 모듈 설치비 x1")).toEqual([
      item("00048", "L100도어락설치+월패드연동설치"),
      item("00047", "L100도어락설치"),
    ]);
    expect(deriveInstallItemsFromMemo("용역 월패드 모듈 설치비 x1")).toEqual([item("00046", "월패드 연동 설치")]);
    expect(deriveInstallItemsFromMemo("용역 도어락 설치비(K100)+월패드 연동(RF447) x1")).toEqual([
      item("00049", "K100도어락설치+월패드연동설치"),
    ]);
  });

  it("takes the doorlock model from the product when the 설치비 has none", () => {
    expect(deriveInstallItemsFromMemo("[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 도어락 설치비 x1")).toEqual([
      item("00047", "L100도어락설치"),
    ]);
    expect(deriveInstallItemsFromMemo("용역 도어락 설치비 x1")).toEqual([item("00061", "도어락 설치만 구매(모델명확인후진행)")]);
  });

  it("marks 현장결제 연동 and skips 스마트홈 services", () => {
    expect(
      deriveInstallItemsFromMemo(
        "스마트 도어락 K100 x1 / 용역 도어락 설치비(K100) x1 / 용역 연동 설치비 (현장결제) x1 / 용역 스마트홈 설계 서비스 x6600 / 용역 스마트홈 앱 설정 서비스 x1",
      ),
    ).toEqual([item("00050", "K100도어락설치"), item("00046", "월패드 연동 설치", 1, true)]);
  });

  it("covers the other PL items and keeps unknown 용역 by name", () => {
    expect(
      deriveInstallItemsFromMemo(
        "용역 조명 스위치 설치비 x3 / 용역 슬림 면조명 설치서비스 x1 / 용역 다운라이트 설치서비스 x6 / 용역 블라인드 설치비 x2 / 용역 커튼레일(커튼 천 결합) 설치비 x1 / 길이조절 커튼 레일 설치 + 출장비 x1 / 용역 커튼레일(전원선매립) 설치비 x1 / ★용역 커튼/블라인드 실측 서비스 x1 / 용역 도어락 원상복구 설치비 x1 / 용역 신규 작업 설치비 x1",
      ),
    ).toEqual([
      item("00060", "도어락 원복설치 서비스"),
      item("00053", "조명스위치 설치", 3),
      item("00068", "슬림면조명 설치(타공 없음)"),
      item("00069", "다운라이트 설치(타공 포함)", 6),
      item("00070", "블라인드 설치", 2),
      item("00071", "용역 커튼레일(커튼 천 결합) 설치비"),
      item("00052", "커튼레일 설치"),
      item(null, "커튼레일(전원선매립) 설치"),
      item(null, "커튼/블라인드 실측"),
      item(null, "신규 작업 설치"),
    ]);
  });

  it("adds up the same item listed twice", () => {
    expect(deriveInstallItemsFromMemo("용역 도어락 설치비(L100) x1 / 용역 도어락 설치비(L100) x1")).toEqual([
      item("00047", "L100도어락설치", 2),
    ]);
    expect(deriveInstallItemsFromMemo(null)).toEqual([]);
  });
});

describe("HQ edits", () => {
  it("fixes catalog names by code and accepts custom items", () => {
    expect(
      normalizeInstallItems([
        { code: "00054", name: "아무거나", quantity: 2 },
        { code: null, name: "  현관 중문  설치 ", quantity: 1, onsitePayment: true },
      ]),
    ).toEqual([item("00054", "도어벨설치", 2), item(null, "현관 중문 설치", 1, true)]);
  });

  it("rejects bad input", () => {
    expect(() => normalizeInstallItems([{ code: "99999", quantity: 1 }])).toThrow(PartnerInstallItemsError);
    expect(() => normalizeInstallItems([{ code: null, name: " ", quantity: 1 }])).toThrow("INSTALL_ITEM_NAME_REQUIRED");
    expect(() => normalizeInstallItems([{ code: "00054", quantity: 0 }])).toThrow("INSTALL_ITEM_QUANTITY_INVALID");
    expect(() => normalizeInstallItems([{ code: "00054", quantity: 1.5 }])).toThrow("INSTALL_ITEM_QUANTITY_INVALID");
  });

  it("uses saved items over the memo, including an empty list", () => {
    const memo = "용역 도어락 설치비(K100) x1";
    expect(resolvePartnerInstallItems(null, memo)).toEqual({ items: [item("00050", "K100도어락설치")], edited: false });
    expect(resolvePartnerInstallItems([], memo)).toEqual({ items: [], edited: true });
    expect(resolvePartnerInstallItems([{ code: "00054", quantity: 1 }], memo).items).toEqual([item("00054", "도어벨설치")]);
    expect(resolvePartnerInstallItems("broken", memo).edited).toBe(false);
  });

  it("formats items for the history note", () => {
    expect(formatInstallItemsText([item("00050", "K100도어락설치"), item("00046", "월패드 연동 설치", 1, true)])).toBe(
      "K100도어락설치 ×1, 월패드 연동 설치 ×1 (현장결제)",
    );
    expect(formatInstallItemsText([])).toBe("(없음)");
  });
});
