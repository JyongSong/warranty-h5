export type GeoPoint = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function getStraightDistanceMeters(from: GeoPoint, to: GeoPoint) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a)));
}

export function formatDistanceKm(meters: number) {
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 지오코딩에 넣을 검색어를 시도할 순서대로 만든다. 고객 주소에는 동·호수나 메모가 붙어
 * 있어 전체 문자열이 실패하면 도로명+건물번호(없으면 지번)까지만 잘라 다시 찾는다.
 */
export function buildGeocodeQueries(address: string) {
  const cleaned = address.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const roadAddress = cleaned.match(/^.*(?:로|길)\s*\d+(?:-\d+)?/)?.[0];
  const lotAddress = cleaned.match(/^.*?[동리가]\s+\d+(?:-\d+)?/)?.[0];

  return Array.from(new Set([cleaned, roadAddress ?? lotAddress].filter((query): query is string => Boolean(query))));
}
