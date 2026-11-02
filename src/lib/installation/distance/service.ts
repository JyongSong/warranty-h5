import { prisma } from "@/lib/prisma";
import { hmacPii } from "@/lib/piiCrypto";
import {
  buildGeocodeQueries,
  getStraightDistanceMeters,
  type GeoPoint,
} from "@/lib/installation/distance/geo";
import { geocodeAddress, getDrivingDistanceMeters } from "@/lib/installation/distance/naver";

// 직선거리로 이만큼만 추린 뒤 경로를 조회한다. 기사 전원을 조회하지 않기 위해서다.
const DRIVING_LOOKUP_LIMIT = 5;
const INSTALLER_GEOCODE_BATCH_SIZE = 20;

export type InstallerDistance = {
  installerId: string;
  installerName: string;
  installerBranch: string | null;
  straightMeters: number;
  drivingMeters: number | null;
};

export type InstallerDistanceResult =
  | { status: "ADDRESS_NOT_FOUND" }
  | {
      status: "OK";
      customer: GeoPoint;
      // 자격이 맞는 기사만 직선거리순으로 담는다. 경로를 조회한 기사만 drivingMeters 가 있다.
      eligible: InstallerDistance[];
      // 자격과 무관하게 호출자가 지정한 기사. 후보 기사가 좌표 없으면 비어 있다.
      included: InstallerDistance[];
    };

type InstallerLocationRow = {
  id: string;
  name: string;
  branch: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodedAddress: string | null;
};

export function normalizeInstallerAddress(address: string | null) {
  return address?.trim() || null;
}

export function needsInstallerGeocoding(installer: Pick<InstallerLocationRow, "address" | "geocodedAddress">) {
  const address = normalizeInstallerAddress(installer.address);
  return Boolean(address) && installer.geocodedAddress !== address;
}

function toInstallerPoint(installer: InstallerLocationRow): GeoPoint | null {
  if (installer.latitude === null || installer.longitude === null) return null;
  if (needsInstallerGeocoding(installer)) return null;
  return { latitude: installer.latitude, longitude: installer.longitude };
}

async function geocodeWithFallback(address: string) {
  for (const query of buildGeocodeQueries(address)) {
    const point = await geocodeAddress(query);
    if (point) return point;
  }
  return null;
}

export async function listActiveInstallerLocations() {
  const installers = await prisma.installer.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      branch: true,
      phone: true,
      address: true,
      latitude: true,
      longitude: true,
      geocodedAddress: true,
    },
    orderBy: { name: "asc" },
  });

  return installers.map((installer) => ({ ...installer, point: toInstallerPoint(installer) }));
}

/** 주소가 새로 들어왔거나 바뀐 활성 기사를 한 묶음씩 좌표로 바꾼다. */
export async function syncInstallerCoordinates({
  limit = INSTALLER_GEOCODE_BATCH_SIZE,
  now = new Date(),
}: { limit?: number; now?: Date } = {}) {
  const installers = await prisma.installer.findMany({
    where: { active: true, address: { not: null } },
    select: { id: true, address: true, geocodedAddress: true },
    orderBy: { createdAt: "asc" },
  });
  const pending = installers.filter(needsInstallerGeocoding);

  let processedCount = 0;
  for (const installer of pending.slice(0, limit)) {
    const address = normalizeInstallerAddress(installer.address) as string;
    const point = await geocodeWithFallback(address);
    await prisma.installer.update({
      where: { id: installer.id },
      data: {
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
        geocodedAddress: address,
        geocodedAt: now,
      },
    });
    processedCount += 1;
  }

  return { processedCount, remainingCount: pending.length - processedCount };
}

async function resolveCustomerPoint(address: string, addressHash: string): Promise<GeoPoint | null> {
  const cached = await prisma.addressGeocodeCache.findUnique({ where: { addressHash } });
  if (cached) {
    return cached.latitude !== null && cached.longitude !== null
      ? { latitude: cached.latitude, longitude: cached.longitude }
      : null;
  }

  const point = await geocodeWithFallback(address);
  await prisma.addressGeocodeCache.upsert({
    where: { addressHash },
    create: { addressHash, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null },
    update: {},
  });
  return point;
}

async function resolveDrivingDistances(
  customer: GeoPoint,
  customerAddressHash: string,
  targets: Array<{ installerId: string; point: GeoPoint }>,
) {
  const cachedRows = await prisma.installerDrivingDistance.findMany({
    where: { customerAddressHash, installerId: { in: targets.map((target) => target.installerId) } },
  });
  const cachedByInstallerId = new Map(cachedRows.map((row) => [row.installerId, row]));
  const distances = new Map<string, number | null>();

  await Promise.all(
    targets.map(async ({ installerId, point }) => {
      const cached = cachedByInstallerId.get(installerId);
      if (
        cached &&
        cached.installerLatitude === point.latitude &&
        cached.installerLongitude === point.longitude
      ) {
        distances.set(installerId, cached.distanceMeters);
        return;
      }

      const distanceMeters = await getDrivingDistanceMeters(point, customer);
      const location = { installerLatitude: point.latitude, installerLongitude: point.longitude, distanceMeters };
      await prisma.installerDrivingDistance.upsert({
        where: { installerId_customerAddressHash: { installerId, customerAddressHash } },
        create: { installerId, customerAddressHash, ...location },
        update: location,
      });
      distances.set(installerId, distanceMeters);
    }),
  );

  return distances;
}

export async function getInstallerDistances({
  address,
  eligibleInstallerIds,
  includeInstallerIds = [],
}: {
  address: string;
  // 없으면 활성 기사 전원이 대상이다.
  eligibleInstallerIds?: string[];
  includeInstallerIds?: string[];
}): Promise<InstallerDistanceResult> {
  const addressHash = hmacPii(address.replace(/\s+/g, " ").trim());
  const customer = await resolveCustomerPoint(address, addressHash);
  if (!customer) return { status: "ADDRESS_NOT_FOUND" };

  const eligibleIds = eligibleInstallerIds ? new Set(eligibleInstallerIds) : null;
  const includedIds = new Set(includeInstallerIds);
  const located = (await listActiveInstallerLocations())
    .flatMap((installer) =>
      installer.point
        ? [{ installer, point: installer.point, straightMeters: getStraightDistanceMeters(installer.point, customer) }]
        : [],
    )
    .sort((left, right) => left.straightMeters - right.straightMeters);

  const eligible = located.filter(({ installer }) => !eligibleIds || eligibleIds.has(installer.id));
  const included = located.filter(({ installer }) => includedIds.has(installer.id));
  const targets = new Map(
    [...eligible.slice(0, DRIVING_LOOKUP_LIMIT), ...included].map(({ installer, point }) => [
      installer.id,
      { installerId: installer.id, point },
    ]),
  );
  const drivingMeters = await resolveDrivingDistances(customer, addressHash, Array.from(targets.values()));

  const toDistance = ({ installer, straightMeters }: (typeof located)[number]): InstallerDistance => ({
    installerId: installer.id,
    installerName: installer.name,
    installerBranch: installer.branch,
    straightMeters,
    drivingMeters: drivingMeters.get(installer.id) ?? null,
  });

  return {
    status: "OK",
    customer,
    eligible: eligible.map(toDistance),
    included: included.map(toDistance),
  };
}

/** 경로 거리가 짧은 순서로 기사를 고른다. */
export function pickNearestInstallers(distances: InstallerDistance[], limit: number) {
  return distances
    .filter((distance) => distance.drivingMeters !== null)
    .sort((left, right) => (left.drivingMeters as number) - (right.drivingMeters as number))
    .slice(0, limit);
}
