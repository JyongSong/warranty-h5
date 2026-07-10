export type ParsedInstallationAddress = {
  sido: string;
  sigungu: string;
};

export type SplitInstallationSourceAddress = {
  address: string;
  addressMain: string | null;
  addressDetail: string | null;
  address1: string | null;
  address2: string | null;
};

const SIDO_ALIASES: Array<{ pattern: RegExp; sido: string }> = [
  { pattern: /^(서울|서울시|서울특별시)$/, sido: "서울" },
  { pattern: /^(부산|부산시|부산광역시)$/, sido: "부산" },
  { pattern: /^(대구|대구시|대구광역시)$/, sido: "대구" },
  { pattern: /^(인천|인천시|인천광역시)$/, sido: "인천" },
  { pattern: /^(광주|광주시|광주광역시)$/, sido: "광주" },
  { pattern: /^(대전|대전시|대전광역시)$/, sido: "대전" },
  { pattern: /^(울산|울산시|울산광역시)$/, sido: "울산" },
  { pattern: /^(세종|세종시|세종특별자치시)$/, sido: "세종" },
  { pattern: /^(경기|경기도)$/, sido: "경기" },
  { pattern: /^(강원|강원도|강원특별자치도)$/, sido: "강원" },
  { pattern: /^(충북|충청북도)$/, sido: "충북" },
  { pattern: /^(충남|충청남도)$/, sido: "충남" },
  { pattern: /^(전북|전라북도|전북특별자치도)$/, sido: "전북" },
  { pattern: /^(전남|전라남도)$/, sido: "전남" },
  { pattern: /^(경북|경상북도)$/, sido: "경북" },
  { pattern: /^(경남|경상남도)$/, sido: "경남" },
  { pattern: /^(제주|제주도|제주특별자치도)$/, sido: "제주" },
];

export function parseInstallationAddress(address: string): ParsedInstallationAddress | null {
  const tokens = address
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length < 2) return null;

  const sido = normalizeSido(tokens[0]);
  if (!sido) return null;

  const sigungu = parseSigungu(tokens.slice(1));
  if (!sigungu) return null;

  return { sido, sigungu };
}

export function splitInstallationSourceAddress(
  value: string | null | undefined,
): SplitInstallationSourceAddress | null {
  const address = value?.trim().replace(/\s+/g, " ");
  if (!address) return null;

  const tokens = address.split(" ").filter(Boolean);
  const address1TokenCount = getAddress1TokenCount(tokens);
  const address1 = address1TokenCount > 0 ? tokens.slice(0, address1TokenCount).join(" ") : null;
  const address2 = address1TokenCount > 0 ? tokens.slice(address1TokenCount).join(" ") || null : null;
  const detailStartIndex = getAddressDetailStartIndex(tokens, address1TokenCount);
  const addressMain = detailStartIndex > 0 ? tokens.slice(0, detailStartIndex).join(" ") : address;
  const addressDetail =
    detailStartIndex > 0 && detailStartIndex < tokens.length
      ? tokens.slice(detailStartIndex).join(" ")
      : null;

  return {
    address,
    addressMain,
    addressDetail,
    address1,
    address2,
  };
}

function normalizeSido(value: string) {
  return SIDO_ALIASES.find(({ pattern }) => pattern.test(value))?.sido ?? null;
}

function parseSigungu(tokens: string[]) {
  const first = tokens[0];
  const second = tokens[1];
  if (!first) return null;

  if (/(시|군)$/.test(first) && second && /(구)$/.test(second)) {
    return `${first} ${second}`;
  }

  if (/(시|군|구)$/.test(first)) {
    return first;
  }

  return null;
}

function getAddress1TokenCount(tokens: string[]) {
  const sido = normalizeSido(tokens[0] ?? "");
  if (!sido) return 0;

  const firstRegion = tokens[1];
  const secondRegion = tokens[2];
  if (firstRegion && /(시|군)$/.test(firstRegion) && secondRegion && /구$/.test(secondRegion)) {
    return 3;
  }

  if (firstRegion && /(시|군|구)$/.test(firstRegion)) {
    return 2;
  }

  return 0;
}

function getAddressDetailStartIndex(tokens: string[], address1TokenCount: number) {
  const searchStartIndex = Math.max(address1TokenCount, 0);
  const buildingNumberIndex = tokens.findIndex((token, index) => {
    return index >= searchStartIndex && /^\d+(?:-\d+)?$/.test(token);
  });

  if (buildingNumberIndex < 0 || buildingNumberIndex + 1 >= tokens.length) {
    return 0;
  }

  return buildingNumberIndex + 1;
}
