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
