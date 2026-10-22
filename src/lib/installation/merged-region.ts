// 2026-07-01 광주광역시와 전라남도가 "전남광주통합특별시"로 합쳐졌다. 도로명주소도
// "전남광주통합특별시 북구 …", "전남광주통합특별시 화순군 …" 처럼 바뀌어 Daum
// 우편번호 검색이 이 이름을 준다. 반면 기사 서비스 지역과 주소 해석은 옛 시/도
// 기준이라, 비교할 때만 옛 이름으로 되돌린다. 저장하는 주소는 그대로 둔다.
//
// 옛 광주광역시 자치구 5곳은 "구"로, 옛 전라남도 시·군은 "시/군"으로 남았으므로
// 바로 뒤 시·군·구를 보면 어느 쪽인지 정할 수 있다.
const MERGED_SIDO = /^(전남광주통합특별시|광주전남통합특별시|전남광주특별시|광주특별시|전남광주)(?=\s|$)/;

const FORMER_GWANGJU_GU = new Set(["동구", "서구", "남구", "북구", "광산구"]);

export function isMergedSidoToken(token: string) {
  return MERGED_SIDO.test(token.trim());
}

/** 맨 앞이 통합특별시면 옛 "광주광역시"/"전라남도"로 바꾼다. 아니면 그대로 돌려준다. */
export function toLegacySidoAddress(address: string) {
  const trimmed = address.trim();
  const match = MERGED_SIDO.exec(trimmed);
  if (!match) return address;

  const rest = trimmed.slice(match[0].length).trim();
  const nextRegion = rest.split(/\s+/)[0] ?? "";
  // 다음 칸이 비어 있으면 어느 쪽인지 알 수 없다. 억지로 고르지 않는다.
  if (!nextRegion) return address;

  const legacySido = FORMER_GWANGJU_GU.has(nextRegion) ? "광주광역시" : "전라남도";
  return `${legacySido} ${rest}`;
}
