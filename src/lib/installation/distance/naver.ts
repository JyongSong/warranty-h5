import type { GeoPoint } from "@/lib/installation/distance/geo";

const NAVER_MAPS_BASE_URL = "https://maps.apigw.ntruss.com";
const NAVER_MAPS_TIMEOUT_MS = 5000;
const DIRECTIONS_SAME_POINT_CODE = 1;

export class NaverMapsError extends Error {}

async function fetchNaverMaps(path: string, params: Record<string, string>) {
  const clientId = process.env.NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new NaverMapsError("NAVER_MAP_NOT_CONFIGURED");

  const response = await fetch(`${NAVER_MAPS_BASE_URL}${path}?${new URLSearchParams(params)}`, {
    headers: {
      Accept: "application/json",
      "x-ncp-apigw-api-key-id": clientId,
      "x-ncp-apigw-api-key": clientSecret,
    },
    signal: AbortSignal.timeout(NAVER_MAPS_TIMEOUT_MS),
  });
  if (!response.ok) throw new NaverMapsError(`NAVER_MAP_HTTP_${response.status}`);

  return response.json();
}

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const body = await fetchNaverMaps("/map-geocode/v2/geocode", { query, count: "1" });
  const address = body?.addresses?.[0];
  if (!address) return null;

  const latitude = Number(address.y);
  const longitude = Number(address.x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

/** 자동차 경로 거리(미터). 경로가 없으면 null 이다. */
export async function getDrivingDistanceMeters(from: GeoPoint, to: GeoPoint): Promise<number | null> {
  const body = await fetchNaverMaps("/map-direction/v1/driving", {
    start: `${from.longitude},${from.latitude}`,
    goal: `${to.longitude},${to.latitude}`,
  });
  if (body?.code === DIRECTIONS_SAME_POINT_CODE) return 0;

  const distance = body?.route?.traoptimal?.[0]?.summary?.distance;
  return typeof distance === "number" ? distance : null;
}
