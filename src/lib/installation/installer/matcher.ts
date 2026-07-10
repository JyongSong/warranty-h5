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
  const nt = normalizeCompact(token)
  if (!nt) return false
  if (isUniversalRegion(nt)) return true
  if (normalizedAddress.includes(nt)) return true

  const parts = token.split(/\s+/g).map((p) => normalizeCompact(p)).filter(Boolean)
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
    .map((t) => isUniversalRegion(t) ? 1 : normalizeCompact(t).length + 10)

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
  const normalizedAddress = normalizeCompact(address)
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
