// 기사 관리 화면(목록·추가·수정)이 함께 쓰는 타입과 라벨.

export type InstallerItem = {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  coverage: string | null;
  address: string | null;
  category: string | null;
  ability: string | null;
  installCount: number | null;
  happyCallLt: number | null;
  defectCount: number | null;
  dissatisfactionNote: string | null;
  serviceAreas: string[];
  capabilities: string[];
  aqaraAppCapability: string;
  hasAqaraHubInventory: boolean;
  asEmergencyAvailability: string | null;
  inCurrentRoster: boolean;
  active: boolean;
  updatedAt: string;
};

export const CAPABILITY_OPTIONS = [
  { value: "DOORLOCK", label: "도어락" },
  { value: "DOORBELL", label: "도어벨" },
  { value: "WALLPAD_HUB", label: "월패드 연동기" },
  { value: "OTHER", label: "기타" },
] as const;

export const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(
  CAPABILITY_OPTIONS.map((option) => [option.value, option.label]),
);

export const AQARA_APP_OPTIONS = [
  { value: "NONE", label: "앱 연동 불가" },
  { value: "DOORLOCK_AND_APP", label: "도어락 + 앱" },
  { value: "DOORLOCK_AND_APP_AND_HUB", label: "도어락 + 앱 + 허브" },
] as const;

export const AQARA_APP_LABEL: Record<string, string> = Object.fromEntries(
  AQARA_APP_OPTIONS.map((option) => [option.value, option.label]),
);

export const STANDARD_REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

/** 담당 지역은 화면에서 줄바꿈으로 입력받고 DB 에는 배열로 넣는다. */
export function parseServiceAreas(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((area) => area.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function formatServiceAreas(areas: string[] | null | undefined): string {
  return (areas ?? []).join("\n");
}

export async function readJson(res: Response) {
  return res.json().catch(() => ({}) as Record<string, unknown>);
}
