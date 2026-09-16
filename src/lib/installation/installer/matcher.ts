export type InstallationOrderInstaller = {
  businessNumber: string
  branchName: string
  phone: string
  installationRegion: string | null
  possibleRegion: string | null
  impossibleRegion: string | null
  monthlyDispatchCount?: number | null
  lastRequestedAt?: Date | string | null
  matchTier?: InstallationMatchTier
}

export type InstallationMatchTier = "EXACT_DISTRICT" | "REGION_ONLY"

const toText = (v: unknown): string => v == null ? "" : String(v).trim()

const normalizeCompact = (v: unknown): string =>
  toText(v).replace(/^﻿/, "").replace(/\s+/g, "")

// 시/도 표기를 법정 정식 명칭으로 모은다.
//
// 주소는 Daum 우편번호 서비스가 주는데 shorthand 기본값이 true 라서 늘 약식이다
// ("경기 성남시 분당구…"). 반면 기사 service_areas 는 정식으로 적힌 것이 훨씬
// 많다("경기도 성남시…"). 매칭이 공백 제거 후 문자열 포함이라, 통일하지 않으면
// "경기도 …" 로 적은 기사가 "경기 …" 주소에서 후보로 아예 잡히지 않는다.
// 반대 방향(약식 기사 ← 정식 주소)만 우연히 동작해서 한쪽으로만 새는 버그였다.
//
// 약식이 아니라 정식 쪽으로 모으는 이유: 약식으로 모으면 "광주"(광역시)와
// "경기 광주시"처럼 짧은 이름끼리 서로 포함되어 엉뚱한 매칭이 생긴다.
//
// 알려진 한계: "광주시", "제주시" 는 광역시/도와 기초자치단체가 겹쳐 모호하므로
// 별칭에 넣지 않는다. 주소는 항상 시/도로 시작하므로("경기 광주시 …") 실무에서
// 문제가 되지 않는다.
const REGION_ALIASES: ReadonlyArray<readonly [string, string]> = ([
  ["서울특별시", "서울특별시"], ["서울시", "서울특별시"], ["서울", "서울특별시"],
  ["부산광역시", "부산광역시"], ["부산시", "부산광역시"], ["부산", "부산광역시"],
  ["대구광역시", "대구광역시"], ["대구시", "대구광역시"], ["대구", "대구광역시"],
  ["인천광역시", "인천광역시"], ["인천시", "인천광역시"], ["인천", "인천광역시"],
  ["광주광역시", "광주광역시"], ["광주", "광주광역시"],
  ["대전광역시", "대전광역시"], ["대전시", "대전광역시"], ["대전", "대전광역시"],
  ["울산광역시", "울산광역시"], ["울산시", "울산광역시"], ["울산", "울산광역시"],
  ["세종특별자치시", "세종특별자치시"], ["세종시", "세종특별자치시"], ["세종", "세종특별자치시"],
  ["경기도", "경기도"], ["경기", "경기도"],
  ["강원특별자치도", "강원특별자치도"], ["강원도", "강원특별자치도"], ["강원", "강원특별자치도"],
  ["충청북도", "충청북도"], ["충북", "충청북도"],
  ["충청남도", "충청남도"], ["충남", "충청남도"],
  ["전북특별자치도", "전북특별자치도"], ["전라북도", "전북특별자치도"], ["전북", "전북특별자치도"],
  ["전라남도", "전라남도"], ["전남", "전라남도"],
  ["경상북도", "경상북도"], ["경북", "경상북도"],
  ["경상남도", "경상남도"], ["경남", "경상남도"],
  ["제주특별자치도", "제주특별자치도"], ["제주도", "제주특별자치도"], ["제주", "제주특별자치도"],
  // 긴 별칭이 먼저 걸려야 "서울특별시" 가 "서울" 로 잘리지 않는다.
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length)

/** 맨 앞의 시/도 표기만 정식 명칭으로 바꾼다. 뒤쪽 시·군·구는 건드리지 않는다. */
function canonicalizeRegion(value: unknown): string {
  const text = toText(value)
  if (!text) return text
  for (const [alias, canonical] of REGION_ALIASES) {
    // 별칭 뒤에 공백이 없어도 된다("서울강남구"). 정렬 덕분에 더 긴 별칭이 먼저 걸린다.
    if (text.startsWith(alias)) return canonical + text.slice(alias.length)
  }
  return text
}

/** 비교용 키: 시/도를 정식 명칭으로 맞춘 뒤 공백을 없앤다. */
const normalizeRegionKey = (v: unknown): string => normalizeCompact(canonicalizeRegion(v))

function isUniversalRegion(value: string): boolean {
  const n = normalizeCompact(value)
  return n === "전국" || n === "전체" || n === "전지역" || n.startsWith("전ㄱ")
}

function splitRegionTokens(value: string): string[] {
  const seen = new Set<string>()
  return value
    .replace(/\([^)]*제외[^)]*\)/g, " ")
    .replace(/（[^）]*제외[^）]*）/g, " ")
    .split(/[\/／|·,，;；\n\r\t]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const n = normalizeCompact(t)
      if (!n || seen.has(n)) return false
      seen.add(n)
      return true
    })
}

function tokenMatchesAddress(token: string, normalizedAddress: string): boolean {
  // normalizedAddress 도 같은 방식으로 정규화되어 들어온다.
  const canonical = canonicalizeRegion(token)
  const nt = normalizeCompact(canonical)
  if (!nt) return false
  if (isUniversalRegion(nt)) return true
  if (normalizedAddress.includes(nt)) return true

  const parts = canonical.split(/\s+/g).map((p) => normalizeCompact(p)).filter(Boolean)
  if (parts.length > 1 && parts.every((p) => normalizedAddress.includes(p))) return true

  if (/^[가-힣]{2,}$/.test(nt)) {
    return (
      normalizedAddress.includes(`${nt}시`) ||
      normalizedAddress.includes(`${nt}구`) ||
      normalizedAddress.includes(`${nt}군`)
    )
  }

  return false
}

function canInstallerServeAddress(
  installer: InstallationOrderInstaller,
  normalizedAddress: string,
): boolean {
  const installationRegion = toText(installer.installationRegion)
  if (!installationRegion || isUniversalRegion(installationRegion)) return true
  if (splitRegionTokens(installationRegion).some((t) => tokenMatchesAddress(t, normalizedAddress))) {
    return true
  }

  const possibleRegions = splitRegionTokens(toText(installer.possibleRegion))
  return possibleRegions.some((t) => !isUniversalRegion(t) && tokenMatchesAddress(t, normalizedAddress))
}

function isAddressExcludedForInstaller(
  installer: InstallationOrderInstaller,
  normalizedAddress: string,
): boolean {
  return splitRegionTokens(toText(installer.impossibleRegion)).some((t) =>
    tokenMatchesAddress(t, normalizedAddress),
  )
}

function scoreInstallerAddressMatch(installer: InstallationOrderInstaller, normalizedAddress: string): number {
  if (isAddressExcludedForInstaller(installer, normalizedAddress)) return 0

  const possibleRegions = splitRegionTokens(toText(installer.possibleRegion))

  const scores = possibleRegions
    .filter((t) => tokenMatchesAddress(t, normalizedAddress))
    .map((t) => isUniversalRegion(t) ? 1 : normalizeRegionKey(t).length + 10)

  return scores.length > 0 ? Math.max(...scores) : 0
}

function getInstallerAddressMatchTier(
  installer: InstallationOrderInstaller,
  normalizedAddress: string,
): InstallationMatchTier | null {
  if (isAddressExcludedForInstaller(installer, normalizedAddress)) return null

  const possibleRegions = splitRegionTokens(toText(installer.possibleRegion))
  if (possibleRegions.some((t) => !isUniversalRegion(t) && tokenMatchesAddress(t, normalizedAddress))) {
    return "EXACT_DISTRICT"
  }

  const installationRegion = toText(installer.installationRegion)
  if (
    installationRegion &&
    !isUniversalRegion(installationRegion) &&
    splitRegionTokens(installationRegion).some((t) => tokenMatchesAddress(t, normalizedAddress))
  ) {
    return "REGION_ONLY"
  }

  if (canInstallerServeAddress(installer, normalizedAddress)) {
    return "REGION_ONLY"
  }

  return null
}

function getTierRank(tier: InstallationMatchTier) {
  return tier === "EXACT_DISTRICT" ? 2 : 1
}

function getMonthlyDispatchCount(installer: InstallationOrderInstaller) {
  return Number.isFinite(installer.monthlyDispatchCount)
    ? Number(installer.monthlyDispatchCount)
    : 0
}

function getLastRequestedTime(installer: InstallationOrderInstaller) {
  if (!installer.lastRequestedAt) return Number.NEGATIVE_INFINITY
  return new Date(installer.lastRequestedAt).getTime()
}

export function findBestMatchingInstallers(address: string): InstallationOrderInstaller[]
export function findBestMatchingInstallers<T extends InstallationOrderInstaller>(
  address: string,
  installers: readonly T[],
): Array<T & { matchTier: InstallationMatchTier }>
export function findBestMatchingInstallers(
  address: string,
  installers?: readonly InstallationOrderInstaller[],
): InstallationOrderInstaller[] {
  const sourceInstallers = installers ?? []
  const normalizedAddress = normalizeRegionKey(address)
  if (!normalizedAddress) return []

  const scored = sourceInstallers
    .map((installer, index) => {
      const matchTier = getInstallerAddressMatchTier(installer, normalizedAddress)
      return {
        installer,
        matchTier,
        index,
        score: scoreInstallerAddressMatch(installer, normalizedAddress),
      }
    })
    .filter((candidate) => candidate.matchTier)
    .sort((a, b) => {
      const tierDiff = getTierRank(b.matchTier as InstallationMatchTier) - getTierRank(a.matchTier as InstallationMatchTier)
      const monthlyDispatchDiff =
        getMonthlyDispatchCount(a.installer) - getMonthlyDispatchCount(b.installer)
      const lastRequestedDiff =
        getLastRequestedTime(a.installer) - getLastRequestedTime(b.installer)
      const installerIdDiff = a.installer.businessNumber.localeCompare(b.installer.businessNumber)
      return tierDiff || monthlyDispatchDiff || lastRequestedDiff || installerIdDiff || b.score - a.score || a.index - b.index
    })

  if (scored.length === 0) return []

  const maxTier = scored[0].matchTier
  return scored
    .filter((candidate) => candidate.matchTier === maxTier)
    .map((candidate) => ({
      ...candidate.installer,
      matchTier: candidate.matchTier as InstallationMatchTier,
    }))
}
