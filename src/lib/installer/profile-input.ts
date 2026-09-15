/**
 * 기사가 직접 채우는 항목들.
 *
 * 총판이 모아 준 명단에는 주소·연동 능력·A/S 긴급출동이 비어 있고, 이름 칸에
 * 사람 이름 대신 상호가 들어간 건도 있다. 이 정보는 본사가 알 수 없으므로
 * 기사에게 링크를 보내 본인이 채우게 한다.
 *
 * 담당 지역과 설치 가능 항목은 여기서 다루지 않는다. 배차가 직접 이 둘을 보고
 * 기사를 고르므로, 기사가 스스로 넓히거나 좁힐 수 있게 하면 배차 결과를
 * 기사 쪽에서 조종할 수 있게 된다. 화면에서도 읽기 전용으로만 보여준다.
 */

/** 설치 가능 항목을 기사에게 보여줄 때 쓰는 한글 이름. */
export const CAPABILITY_LABEL_KO: Record<string, string> = {
  DOORLOCK: "도어락",
  DOORBELL: "도어벨",
  WALLPAD_HUB: "월패드 연동기",
  OTHER: "기타",
};

export const AQARA_APP_CHOICES = [
  { value: "NONE", label: "앱 연동 불가" },
  { value: "DOORLOCK_AND_APP", label: "앱 연동 가능" },
  { value: "DOORLOCK_AND_APP_AND_HUB", label: "앱 + 허브 연동 가능" },
] as const;

export const AS_EMERGENCY_CHOICES = [
  { value: "가능", label: "가능" },
  { value: "불가", label: "불가" },
] as const;

const AQARA_VALUES = new Set(AQARA_APP_CHOICES.map((c) => c.value as string));
const AS_VALUES = new Set(AS_EMERGENCY_CHOICES.map((c) => c.value as string));

export class InstallerProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallerProfileError";
  }
}

export type InstallerProfileInput = {
  name: string;
  branch: string;
  address: string;
  aqaraAppCapability: string;
  asEmergencyAvailability: string;
};

/**
 * 기사가 제출한 값을 검증한다. 화면 입력을 그대로 믿지 않는다 —
 * 선택지는 두 목록 안에 있어야 하고, 이름과 주소는 비어 있으면 안 된다.
 */
export function parseInstallerProfileInput(input: {
  name?: unknown;
  branch?: unknown;
  address?: unknown;
  aqaraAppCapability?: unknown;
  asEmergencyAvailability?: unknown;
}): InstallerProfileInput {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new InstallerProfileError("NAME_REQUIRED");

  // 상호명은 배차 문자에 상호로 찍히는 값이라, 총판 명단의 표기가 맞는지
  // 본인에게 확인받는다.
  const branch = String(input.branch ?? "").replace(/\s+/g, " ").trim();
  if (!branch) throw new InstallerProfileError("BRANCH_REQUIRED");

  const address = String(input.address ?? "").replace(/\s+/g, " ").trim();
  if (!address) throw new InstallerProfileError("ADDRESS_REQUIRED");

  const aqaraAppCapability = String(input.aqaraAppCapability ?? "");
  if (!AQARA_VALUES.has(aqaraAppCapability)) {
    throw new InstallerProfileError("AQARA_APP_CAPABILITY_REQUIRED");
  }

  const asEmergencyAvailability = String(input.asEmergencyAvailability ?? "");
  if (!AS_VALUES.has(asEmergencyAvailability)) {
    throw new InstallerProfileError("AS_EMERGENCY_REQUIRED");
  }

  return { name, branch, address, aqaraAppCapability, asEmergencyAvailability };
}
