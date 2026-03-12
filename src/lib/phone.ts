export function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

export function formatKrPhone(input: string) {
  const digits = normalizePhone(input);

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return input;
}

export function krToE164(input: string) {
  const digits = normalizePhone(input);
  // 01012345678 -> +821012345678
  if (digits.startsWith("0")) return `+82${digits.slice(1)}`;
  // 已经像 8210... 就补 +
  if (digits.startsWith("82")) return `+${digits}`;
  // 兜底：原样加 +
  return digits.startsWith("+") ? digits : `+${digits}`;
}
