// A/S symptom (불량) code classification. Provided by the client 2026-08-12.
// Used for the A/S order 증상코드 selector and display. Kept as a code constant
// (not a DB table) for now; promote to a table if it needs admin editing.

export type AsSymptom = { code: string; label: string };
export type AsSymptomCategory = { code: string; label: string; symptoms: AsSymptom[] };

export const AS_SYMPTOM_CATEGORIES: AsSymptomCategory[] = [
  {
    code: "I",
    label: "설치",
    symptoms: [
      { code: "I-001", label: "자가 설치 불량" },
      { code: "I-002", label: "기사 설치 불량" },
      { code: "I-003", label: "결로 발생" },
      { code: "I-004", label: "설치 후 배터리 커버 안 열림" },
      { code: "I-005", label: "도어락 본체 흔들림/고정 불량" },
    ],
  },
  {
    code: "O",
    label: "외관/구성품",
    symptoms: [
      { code: "O-001", label: "기구물 불량 (부품/구성품 누락 포함)" },
      { code: "O-002", label: "외관 스크래치/찍힘/파손" },
      { code: "O-003", label: "포장재 파손" },
    ],
  },
  {
    code: "U",
    label: "사용/권한",
    symptoms: [
      { code: "U-001", label: "사용법 미숙으로 정상 사용 불가" },
      { code: "U-002", label: "관리자 권한 분실/복구 불가" },
      { code: "U-003", label: "초기화/등록 시 관리자 비밀번호 분실" },
    ],
  },
  {
    code: "P",
    label: "전원/배터리",
    symptoms: [
      { code: "P-001", label: "전원 무감/부팅 불가" },
      { code: "P-002", label: "비상 전원(9V) 인가 시 무감" },
      { code: "P-003", label: "설치 후 건전지 과소모" },
      { code: "P-004", label: "배터리 잔량 표시 오류" },
      { code: "P-005", label: "전원 부족/이상 알림 발생" },
      { code: "P-006", label: "배터리 방전" },
    ],
  },
  {
    code: "M",
    label: "모티스/기구",
    symptoms: [
      { code: "M-001", label: "인증 후 모티스 동작 불가" },
      { code: "M-002", label: "푸쉬풀 핸들 동작 불량 (데드볼트 미연동)" },
      { code: "M-003", label: "문 개방 시 경보 알람 발생" },
      { code: "M-004", label: "스트라이크-데드볼트 간섭 → 개방 불량" },
    ],
  },
  {
    code: "L",
    label: "잠금",
    symptoms: [
      { code: "L-001", label: "잠금 해제 불가 (지문/비번/NFC/BT 전체)" },
      { code: "L-002", label: "내부 잠금 설정 후 관리자 호출 멘트 발생" },
      { code: "L-003", label: "수동 잠금 버튼 무감" },
    ],
  },
  {
    code: "R",
    label: "인식/등록/페어링",
    symptoms: [
      { code: "R-001", label: "지문 인식/등록 불가" },
      { code: "R-002", label: "NFC 카드 인식 불가" },
      { code: "R-003", label: "스마트폰 페어링 불가" },
      { code: "R-004", label: "초기 비밀번호 오류/등록 불가" },
      { code: "R-005", label: "내부·외부 기기 간 페어링 불량" },
      { code: "R-006", label: "리셋 버튼 동작 불량" },
    ],
  },
  {
    code: "K",
    label: "키패드",
    symptoms: [
      { code: "K-001", label: "키패드 무감/먹통" },
      { code: "K-002", label: "특정/일부 키 터치 불가" },
      { code: "K-003", label: "외부 터치 반응(소리만) 있으나 무반응" },
      { code: "K-004", label: "특정 키 또는 전체 LED 점등 불량" },
      { code: "K-005", label: "리셋키 무감" },
    ],
  },
  {
    code: "V",
    label: "음성/소리",
    symptoms: [
      { code: "V-001", label: "터치음/안내멘트 미출력" },
      { code: "V-002", label: "음성 찢어짐/버벅거림" },
    ],
  },
  {
    code: "C",
    label: "앱/연동",
    symptoms: [
      { code: "C-001", label: "Aqara App 연동 불량" },
      { code: "C-002", label: "스마트싱스 연동 불량" },
      { code: "C-003", label: "Hub 연동 불량" },
      { code: "C-004", label: "펌웨어 업데이트 실패/중단" },
    ],
  },
  {
    code: "E",
    label: "기타",
    symptoms: [
      { code: "E-001", label: "월패드 연동 불량" },
      { code: "E-002", label: "구분 외 특이 사항" },
    ],
  },
];

const SYMPTOM_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  AS_SYMPTOM_CATEGORIES.flatMap((c) => c.symptoms.map((s) => [s.code, s.label])),
);

export function isValidAsSymptomCode(code: string): boolean {
  return code in SYMPTOM_LABEL_BY_CODE;
}

export function getAsSymptomLabel(code: string): string {
  return SYMPTOM_LABEL_BY_CODE[code] ?? code;
}
