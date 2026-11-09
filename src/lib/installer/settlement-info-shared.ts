// 기사 정산 정보: 서버·클라이언트 공용 상수와 검증. DB·Storage 를 불러오지 않는다.

export const TAX_DOC_TYPES = ["E_TAX_INVOICE", "PAPER_TAX_INVOICE", "CASH_RECEIPT"] as const;
export type TaxDocType = (typeof TAX_DOC_TYPES)[number];

export const TAX_DOC_TYPE_LABEL: Record<TaxDocType, string> = {
  E_TAX_INVOICE: "전자세금계산서",
  PAPER_TAX_INVOICE: "종이 세금계산서",
  CASH_RECEIPT: "현금영수증",
};

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
