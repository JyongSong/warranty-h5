export function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

export function formatKrPhone(input: string) {
  const digits = normalizePhone(input);

  if (/^050\d{9}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return input;
}

/**
 * 안심번호(050X)인지. 온라인몰이 구매자 번호를 가려서 내려주는 임시 번호로,
 * 보통 며칠 뒤 만료된다. 주문 데이터에는 그대로 들어오지만, 설치 기사가
 * 며칠 뒤 전화를 거는 용도로는 쓸 수 없다.
 */
export function isSafeVirtualNumber(input: string): boolean {
  return /^050\d{8,9}$/.test(normalizePhone(input));
}

/** 한국 휴대폰 번호(01X)인지. 기사가 전화·문자를 보낼 수 있어야 한다. */
export function isKoreanMobileNumber(input: string): boolean {
  return /^01[016789]\d{7,8}$/.test(normalizePhone(input));
}
