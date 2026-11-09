import { getInstallerDistances } from "@/lib/installation/distance/service";
import {
  findRegionEligibleInstallers,
  getLastRequestedTime,
  getMatchTierRank,
  getMonthlyDispatchCount,
  type InstallationMatchTier,
  type InstallationOrderInstaller,
} from "@/lib/installation/installer/matcher";

/**
 * 거리 + 지역 기준 자동 배정.
 *
 * - 후보: 담당 지역이 주소를 덮고(시·군·구 일치 또는 광역) 거리가 20km 이내인 기사.
 *   거리는 경로 거리(네이버 길찾기)를 쓰고, 경로를 못 구한 기사는 직선 거리로 본다.
 *   좌표가 없는 기사(주소 미등록·좌표 변환 전)는 거리를 알 수 없어 자동 후보에서 빠진다.
 * - 순서: 10km 구간 → 시·군·구 일치 우선 → 이번 달 배정 적은 순 → 오래전에 요청받은 순 → 가까운 순.
 *   가장 가까운 한 명에게 몰리지 않게 10km 안에서는 기존 배정 균형을 그대로 쓴다.
 * - 20km 안에 아무도 없으면 자동 배정하지 않고 관리자에게 넘긴다(호출부).
 * - 고객 주소 좌표를 못 구하거나 지도 API 가 실패하면 UNAVAILABLE — 호출부가 기존 지역 규칙으로 돌아간다.
 */
export const AUTO_DISPATCH_MAX_METERS = 20_000;
export const DISTANCE_BAND_METERS = 10_000;

export type DistanceRankedInstaller<T extends InstallationOrderInstaller> = T & {
  matchTier: InstallationMatchTier;
  distanceMeters: number;
  distanceSource: "DRIVING" | "STRAIGHT";
};

export type DistanceRankingResult<T extends InstallationOrderInstaller> =
  | {
      status: "OK";
      /** 20km 이내, 정렬 끝난 후보 */
      candidates: Array<DistanceRankedInstaller<T>>;
      /** 지역은 맞지만 20km 밖이거나 좌표가 없어 빠진 기사 수 (관리자 안내용) */
      excludedCount: number;
    }
  | { status: "UNAVAILABLE"; reason: string };

type DistanceLookup = typeof getInstallerDistances;

export async function rankInstallersByDistance<T extends InstallationOrderInstaller>(
  address: string,
  installers: readonly T[],
  lookup: DistanceLookup = getInstallerDistances,
): Promise<DistanceRankingResult<T>> {
  const eligible = findRegionEligibleInstallers(address, installers);
  if (eligible.length === 0) return { status: "OK", candidates: [], excludedCount: 0 };

  let result: Awaited<ReturnType<DistanceLookup>>;
  try {
    result = await lookup({ address, eligibleInstallerIds: eligible.map((installer) => installer.businessNumber) });
  } catch (error) {
    console.error("[installation/dispatch/distance]", error);
    return { status: "UNAVAILABLE", reason: error instanceof Error ? error.message : "DISTANCE_LOOKUP_FAILED" };
  }
  if (result.status !== "OK") return { status: "UNAVAILABLE", reason: result.status };

  const distanceById = new Map(
    result.eligible.map((row) => [
      row.installerId,
      row.drivingMeters !== null
        ? { meters: row.drivingMeters, source: "DRIVING" as const }
        : { meters: row.straightMeters, source: "STRAIGHT" as const },
    ]),
  );

  const candidates = sortDistanceCandidates(
    eligible.flatMap((installer) => {
      const distance = distanceById.get(installer.businessNumber);
      if (!distance || distance.meters > AUTO_DISPATCH_MAX_METERS) return [];
      return [{ ...installer, distanceMeters: distance.meters, distanceSource: distance.source }];
    }),
  );

  return { status: "OK", candidates, excludedCount: eligible.length - candidates.length };
}

export function sortDistanceCandidates<T extends InstallationOrderInstaller & { matchTier: InstallationMatchTier; distanceMeters: number }>(
  candidates: T[],
): T[] {
  const band = (meters: number) => Math.floor(meters / DISTANCE_BAND_METERS);
  return candidates.slice().sort(
    (a, b) =>
      band(a.distanceMeters) - band(b.distanceMeters) ||
      getMatchTierRank(b.matchTier) - getMatchTierRank(a.matchTier) ||
      getMonthlyDispatchCount(a) - getMonthlyDispatchCount(b) ||
      getLastRequestedTime(a) - getLastRequestedTime(b) ||
      a.distanceMeters - b.distanceMeters ||
      a.businessNumber.localeCompare(b.businessNumber),
  );
}
