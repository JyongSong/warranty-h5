/**
 * 모델명 비교용 키. 대소문자·공백·하이픈·점을 빼고 대문자로 맞춘다.
 * "KHN-Q100LT" 와 "khn q100lt" 를 같은 모델로 본다.
 */
export function wallpadModelKey(model: string): string {
  return model.toUpperCase().replace(/[\s\-_.·/]+/g, "");
}

/** 검색어 비교용. 공백을 빼고 소문자로 맞춘다. 한글은 그대로 둔다. */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.·()/]+/g, "");
}

/**
 * 설치 주소에서 단지를 가리키는 부분(도로명+건물번호)만 남긴다. 동·호수와 괄호 안 참고항목은 버린다.
 * 같은 단지의 사례를 묶는 키로 쓰므로 공백을 하나로 맞추고 앞의 우편번호도 뗀다.
 * 도로명 주소가 아니면(지번 등) null — 그런 사례는 단지명으로만 찾는다.
 */
export function wallpadSiteAddress(address: string | null | undefined): string | null {
  const cleaned = (address ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\d{5}\s+/, "");
  if (!cleaned) return null;
  return cleaned.match(/^.*?(?:로|길)\s*\d+(?:-\d+)?(?=\s|$)/)?.[0] ?? null;
}

/** 단지 묶음 키. 주소를 비교용으로 다듬은 값이다. */
export function wallpadSiteKey(siteAddress: string | null): string | null {
  return siteAddress ? normalizeSearchText(siteAddress) : null;
}

/**
 * 주소 끝의 "(동이름, 아파트명)" 참고항목에서 아파트명을 꺼낸다. 다음 우편번호 검색이 붙이는 형식이다.
 * 동이름만 있거나 괄호가 없으면 null.
 */
export function siteNameFromAddress(address: string | null | undefined): string | null {
  const groups = Array.from((address ?? "").matchAll(/\(([^)]*)\)/g), (m) => m[1]);
  for (const group of groups.reverse()) {
    const parts = group.split(",").map((p) => p.trim()).filter(Boolean);
    const candidate = parts.length > 1 ? parts[parts.length - 1] : null;
    if (candidate) return candidate;
  }
  return null;
}
