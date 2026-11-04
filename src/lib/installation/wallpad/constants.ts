// RF447 월패드 호환 DB 에서 쓰는 코드값과 화면 문구.

// 완료 등록의 월패드 연동 결과. NOT_ATTEMPTED 는 고객이 원하지 않았거나 시도하지 않은 경우다.
export const WALLPAD_RESULTS = ["NOT_ATTEMPTED", "SUCCESS", "FAIL"] as const;
export type WallpadResult = (typeof WALLPAD_RESULTS)[number];

export const WALLPAD_RESULT_LABEL: Record<WallpadResult, string> = {
  NOT_ATTEMPTED: "연동 안 함",
  SUCCESS: "연동 성공",
  FAIL: "시도했지만 실패",
};

// 실패 사유. 기사가 하나만 고른다.
export const WALLPAD_FAIL_REASONS = ["UNSUPPORTED_MODEL", "SITE_SPEC", "WIRING", "OTHER"] as const;
export type WallpadFailReason = (typeof WALLPAD_FAIL_REASONS)[number];

export const WALLPAD_FAIL_REASON_LABEL: Record<WallpadFailReason, string> = {
  UNSUPPORTED_MODEL: "월패드 모델이 지원하지 않음",
  SITE_SPEC: "단지 전용 사양·신호 방식",
  WIRING: "배선 문제·노후",
  OTHER: "기타",
};

// 기사가 고르는 제조사. 목록에 없으면 "기타/모름" 을 고르고 모델명에 적는다.
export const WALLPAD_BRANDS = [
  "코콤",
  "코맥스",
  "현대통신",
  "경동나비엔",
  "삼성SDS",
  "직방/삼성",
  "씨브이네트(CVNET)",
  "베스틴(HDC랩스)",
  "링스텔레콤",
  "바하",
  "기타/모름",
] as const;

export const WALLPAD_MODEL_MAX_LENGTH = 60;
export const WALLPAD_NOTE_MAX_LENGTH = 500;

// 모델 판정. 관리자가 정한다.
export const WALLPAD_VERDICTS = [
  "COMPATIBLE",
  "LIKELY",
  "DIFFICULT",
  "INCOMPATIBLE",
  "CAUTION_OLD",
  "UNVERIFIED",
] as const;
export type WallpadVerdict = (typeof WALLPAD_VERDICTS)[number];

export const WALLPAD_VERDICT_LABEL: Record<WallpadVerdict, string> = {
  COMPATIBLE: "연동 가능",
  LIKELY: "연동 가능성 높음",
  DIFFICULT: "연동 어려움",
  INCOMPATIBLE: "연동 불가",
  CAUTION_OLD: "설치 주의 · 노후",
  UNVERIFIED: "확인 필요",
};

export const WALLPAD_VERDICT_HELP: Record<WallpadVerdict, string> = {
  COMPATIBLE: "현장에서 연동 성공이 확인된 모델",
  LIKELY: "공식 지원 목록 등재 또는 다른 단지 성공 사례가 있는 모델. 해당 단지 설치 보장은 아님",
  DIFFICULT: "실패 사례가 많지만 일부 단지는 가능한 모델",
  INCOMPATIBLE: "연동 불가 근거가 있는 모델",
  CAUTION_OLD: "배선 노후 등 작업 위험이 있어 현장 점검이 우선인 모델",
  UNVERIFIED: "정보 부족. 연동 불가를 뜻하지 않음",
};

// 현장 사례 결과. SPECIAL 은 일반 설치는 불가하지만 별도 배선 등 특수 시공으로 성공한 경우다.
export const WALLPAD_CASE_RESULTS = ["SUCCESS", "FAIL", "SPECIAL"] as const;
export type WallpadCaseResult = (typeof WALLPAD_CASE_RESULTS)[number];

export const WALLPAD_CASE_RESULT_LABEL: Record<WallpadCaseResult, string> = {
  SUCCESS: "연동 성공",
  FAIL: "연동 실패",
  SPECIAL: "특수 시공 성공",
};

export const WALLPAD_CASE_SOURCES = ["COMPLETION", "ADMIN", "IMPORT"] as const;
export type WallpadCaseSource = (typeof WALLPAD_CASE_SOURCES)[number];

export const WALLPAD_CASE_SOURCE_LABEL: Record<WallpadCaseSource, string> = {
  COMPLETION: "완료 등록",
  ADMIN: "관리자 입력",
  IMPORT: "기존 자료",
};

export const WALLPAD_NOTE_KINDS = ["BRAND", "BUILDER"] as const;
export type WallpadNoteKind = (typeof WALLPAD_NOTE_KINDS)[number];

export const WALLPAD_NOTE_KIND_LABEL: Record<WallpadNoteKind, string> = {
  BRAND: "제조사",
  BUILDER: "시공사·아파트 브랜드",
};

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
