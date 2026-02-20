export function krToE164(input: string) {
  const digits = (input ?? "").replace(/[^\d]/g, "");
  // 01012345678 -> +821012345678
  if (digits.startsWith("0")) return `+82${digits.slice(1)}`;
  // 已经像 8210... 就补 +
  if (digits.startsWith("82")) return `+${digits}`;
  // 兜底：原样加 +
  return digits.startsWith("+") ? digits : `+${digits}`;
}