// 관리자 직접 입력 주문의 설치 품목.
//
// 배정 조건(도어락/월패드 능력)과 기사 앱·협력사 화면의 설치 품목은 모두
// installation_order_sources.memo 를 ERP 형식("품목명 x수량 / ...")으로 읽어 뽑는다
// (source-items.ts 의 inferDispatchRequirementFromMemo, install-items.ts 의 deriveInstallItemsFromMemo).
// 그래서 관리자가 고른 품목도 ERP 용역 품목 이름으로 바꿔 메모에 적는다. 그래야 그 뒤
// 배정·완료·정산이 ERP 주문과 같은 경로를 탄다.
//
// 이 파일은 화면(클라이언트)에서도 쓰므로 서버 전용 모듈을 가져오지 않는다.

export const ADMIN_ORDER_ITEM_OPTIONS = [
  { value: "K100", label: "K100 도어락 설치", memoName: "용역 도어락 설치비(K100)" },
  { value: "L100", label: "L100 도어락 설치", memoName: "용역 도어락 설치비(L100)" },
  { value: "U100", label: "U100 도어락 설치", memoName: "용역 도어락 설치비(U100)" },
  { value: "K100_WALLPAD", label: "K100 도어락 설치 + 월패드 연동", memoName: "용역 도어락 설치비(K100)+월패드 연동" },
  { value: "L100_WALLPAD", label: "L100 도어락 설치 + 월패드 연동", memoName: "용역 도어락 설치비(L100)+월패드 연동" },
  { value: "WALLPAD", label: "월패드 연동 설치", memoName: "용역 월패드 모듈 설치" },
  { value: "DOORLOCK_RESTORE", label: "도어락 원상복구", memoName: "용역 도어락 원상복구" },
  { value: "DOORBELL", label: "도어벨 설치", memoName: "용역 도어벨 설치" },
  { value: "CURTAIN_RAIL", label: "커튼레일 설치", memoName: "용역 커튼레일 설치" },
  { value: "LIGHT_SWITCH", label: "조명 스위치 설치", memoName: "용역 조명 스위치 설치" },
] as const;

/** 목록에 없는 품목을 직접 적을 때의 선택값 */
export const ADMIN_ORDER_ITEM_CUSTOM = "CUSTOM";

export const ADMIN_ORDER_ITEMS_MAX = 10;
export const ADMIN_ORDER_ITEM_NAME_MAX = 50;
export const ADMIN_ORDER_ITEM_QUANTITY_MAX = 99;

export type AdminOrderItemInput = {
  /** ADMIN_ORDER_ITEM_OPTIONS 의 value, 또는 ADMIN_ORDER_ITEM_CUSTOM */
  option: string;
  /** 직접 입력일 때만 쓴다 */
  customName?: string | null;
  quantity: number;
};

export class AdminOrderItemsError extends Error {}

const MEMO_NAME_BY_OPTION = new Map<string, string>(
  ADMIN_ORDER_ITEM_OPTIONS.map((option) => [option.value, option.memoName]),
);

/**
 * 품목 선택을 ERP 형식 메모로 바꾼다. 예) "용역 도어락 설치비(K100) x1 / 용역 도어벨 설치 x2"
 * 직접 입력 품목은 "용역 " 을 붙여 적는다 — 기사 앱 품목은 용역 품목만 보여 주기 때문이다.
 */
export function buildAdminOrderItemsMemo(items: AdminOrderItemInput[]): string {
  if (items.length === 0) throw new AdminOrderItemsError("INSTALL_ITEMS_REQUIRED");
  if (items.length > ADMIN_ORDER_ITEMS_MAX) throw new AdminOrderItemsError("INSTALL_ITEMS_TOO_MANY");

  return items
    .map((item) => {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > ADMIN_ORDER_ITEM_QUANTITY_MAX) {
        throw new AdminOrderItemsError("INSTALL_ITEM_QUANTITY_INVALID");
      }
      return `${resolveMemoName(item)} x${quantity}`;
    })
    .join(" / ");
}

function resolveMemoName(item: AdminOrderItemInput) {
  if (item.option === ADMIN_ORDER_ITEM_CUSTOM) {
    // " / " 와 " x숫자" 는 메모 구분자라 이름 안에 들어가면 품목이 쪼개진다.
    const name = (item.customName ?? "")
      .replace(/\//g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+x\s*\d+\s*$/i, "")
      .trim()
      .replace(/^용역\s*/, "");
    if (!name) throw new AdminOrderItemsError("INSTALL_ITEM_NAME_REQUIRED");
    if (name.length > ADMIN_ORDER_ITEM_NAME_MAX) throw new AdminOrderItemsError("INSTALL_ITEM_NAME_TOO_LONG");
    return `용역 ${name}`;
  }

  const memoName = MEMO_NAME_BY_OPTION.get(item.option);
  if (!memoName) throw new AdminOrderItemsError("INSTALL_ITEM_INVALID");
  return memoName;
}
