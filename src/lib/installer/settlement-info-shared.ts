// 기사 정산 정보: 서버·클라이언트 공용 상수와 검증. DB·Storage 를 불러오지 않는다.

export const TAX_DOC_TYPES = ["E_TAX_INVOICE", "PAPER_TAX_INVOICE", "CASH_RECEIPT"] as const;
export type TaxDocType = (typeof TAX_DOC_TYPES)[number];

export const TAX_DOC_TYPE_LABEL: Record<TaxDocType, string> = {
  E_TAX_INVOICE: "전자세금계산서",
  PAPER_TAX_INVOICE: "종이 세금계산서",
  CASH_RECEIPT: "현금영수증",
};

/**
 * 기사별 증빙 종류(정산 정보 단위) 표시. 정산서 단위 표시(TAX_DOC_TYPE_LABEL)와 뜻이 다르다.
 * - E_TAX_INVOICE: 전자세금계산서(팝빌) — 앱에서 팝빌로 발행
 * - PAPER_TAX_INVOICE: 세금계산서 — 홈택스·종이로 직접 발행하고 사진 제출(팝빌 연동돼 있으면 앱 발행도 가능)
 * - CASH_RECEIPT: 현금영수증
 * 기사 앱 정산 정보 화면에서는 「세금계산서」 하나로 고르고, 서버가 팝빌 연동 여부로 둘 중 하나를 정한다.
 */
export const INFO_DOC_TYPE_LABEL: Record<TaxDocType, string> = {
  E_TAX_INVOICE: "전자세금계산서(팝빌)",
  PAPER_TAX_INVOICE: "세금계산서",
  CASH_RECEIPT: "현금영수증",
};
export const INFO_DOC_TYPE_ORDER: TaxDocType[] = ["E_TAX_INVOICE", "PAPER_TAX_INVOICE", "CASH_RECEIPT"];

/** 기사가 「세금계산서」를 골랐을 때 저장할 값: 이미 세금계산서 계열이면 그대로, 아니면 팝빌 연동 완료면 전자, 아니면 직접 발행 */
export function resolveTaxChoice(
  existing: TaxDocType | null | undefined,
  popbillReady: boolean,
): TaxDocType {
  if (existing === "E_TAX_INVOICE" || existing === "PAPER_TAX_INVOICE") return existing;
  return popbillReady ? "E_TAX_INVOICE" : "PAPER_TAX_INVOICE";
}

export type SettlementInfoStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export const SETTLEMENT_INFO_STATUS_LABEL: Record<SettlementInfoStatus, string> = {
  SUBMITTED: "확인 중",
  APPROVED: "승인",
  REJECTED: "반려",
};

/** 사업자등록번호 10자리 검증(국세청 검증번호 규칙). 하이픈 등은 미리 빼고 넘긴다. */
export function isValidBusinessNumber(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const n = digits.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i] * weights[i];
  sum += Math.floor((n[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === n[9];
}

export function formatBusinessNumber(digits: string): string {
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : digits;
}
