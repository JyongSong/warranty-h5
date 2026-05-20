// 다른 프로젝트가 본 프로젝트의 내부 SMS API 등을 호출할 때 사용하는 단순 키 검증.

export function validateInternalApiKey(value: string | null): boolean {
  const expected = process.env.INTERNAL_API_KEY?.trim();
  if (!expected) return false;
  return value === expected;
}
