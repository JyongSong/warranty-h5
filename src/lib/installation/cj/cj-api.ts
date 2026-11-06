// CJ 온스타일 배송 통합 조회(getDeliveryList) 응답 행 → 주문번호 명단 행.
// 문서: partners.cjonstyle.com/standardApi/apiDocs?drServiceType=04
//
// CJ API 는 등록된 고정 IP 에서만 부를 수 있어서, 회사 고정 IP 뒤의 PC 가
// scripts/cj-order-push.mjs 로 직접 조회하고 결과를 우리 서버로 밀어 넣는다
// (POST /api/internal/cj/order-push). 서버는 CJ 를 부르지 않는다.
//
// PC 는 개인정보(주문자·인수자 이름/전화/주소)를 보내지 않는다. 여기서도
// 주문번호·순번·결제일·상품코드만 받는다.

export type CjDeliveryRow = {
  orderNo?: string | null;
  orderItemSequence?: string | null;
  orderDetailSequence?: string | null;
  orderProcessingSequence?: string | null;
  paymentDate?: string | null;
  itemCode?: string | null;
};

// [CJ단독] 아카라 스마트 도어락 K100 웜다크실버 방문설치 패키지
export const CJ_DEFAULT_ITEM_CODES = ["2093860797"];

// 명단에 넣을 상품코드. 같은 협력사 계정으로 스위치·허브 같은 설치 없는
// 상품도 팔기 때문에 PC 쪽 조건과 별개로 서버에서도 거른다.
export function parseItemCodes(raw: string | undefined) {
  const codes = (raw ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => /^\d{6,25}$/.test(code));
  return codes.length > 0 ? Array.from(new Set(codes)) : [...CJ_DEFAULT_ITEM_CODES];
}

// 업로드 명단과 같은 23자리 시스템 번호: 주문번호 14 + 순번 3 × 3.
export function toCjManifestRow(row: CjDeliveryRow): { orderNo: string; orderDate: string | null } | null {
  const orderNo = row.orderNo?.trim() ?? "";
  if (!/^\d{14}$/.test(orderNo)) return null;

  const sequences = [row.orderItemSequence, row.orderDetailSequence, row.orderProcessingSequence].map(
    (value) => value?.trim() ?? "",
  );
  if (!sequences.every((value) => /^\d{1,3}$/.test(value))) return null;

  const paymentDate = row.paymentDate?.trim().slice(0, 10) ?? "";
  const orderDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? paymentDate : null;

  return {
    orderNo: orderNo + sequences.map((value) => value.padStart(3, "0")).join(""),
    orderDate,
  };
}
