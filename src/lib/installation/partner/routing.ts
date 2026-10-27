// 외부 협력사(PL) 배정 규칙.
//
// 자사 도어락 기사가 맡는 용역 품목(00010 출장비, 00012* 도어락 설치비, 00016, 00019 월패드 모듈,
// 00021, 00022, 00030*) 밖의 용역 품목이 하나라도 든 주문은, 도어락이 섞여 있어도 주문 전체를
// 협력사에 넘긴다. 품목명은 ERP 동기화가 원천 메모에 "품목명 x수량" 으로 남긴 MA_PITEM.NM_ITEM 그대로다.
// 코드 목록은 dispatch.ts 의 PARTNER_SERVICE_ITEM_CODES 와 맞춘다.

export const PARTNER_SERVICE_ITEM_NAMES = [
  "용역매출", // 00004
  "용역 조명 스위치 설치비", // 00011
  "용역 커튼레일 설치비", // 00013
  "용역 커튼레일(커튼 천 결합) 설치비", // 00013-1
  "용역 커튼/블라인드 실측 서비스", // 00013-2 (★ 접두어)
  "용역 커튼레일(전원선매립) 설치비", // 00014
  "용역 도어벨 설치비", // 00015
  "용역 도어벨 상시전원 설치비", // 00015-1
  "용역 슬림 면조명 설치서비스", // 00024
  "용역 다운라이트 설치서비스", // 00025
  "용역 블라인드 설치비", // 00027
] as const;

export const DEFAULT_PARTNER_CODE = "PL";

// 관리자가 자동 판별을 덮어쓴 값. null 이면 메모로 판별한다.
export const PARTNER_ROUTING = {
  PARTNER: "PARTNER",
  INHOUSE: "INHOUSE",
} as const;

export function hasPartnerServiceItem(memo: string | null | undefined) {
  if (!memo) return false;
  return PARTNER_SERVICE_ITEM_NAMES.some((name) => memo.includes(name));
}

export function shouldRouteToPartner({
  memo,
  partnerRouting,
}: {
  memo: string | null | undefined;
  partnerRouting: string | null | undefined;
}) {
  if (partnerRouting === PARTNER_ROUTING.INHOUSE) return false;
  if (partnerRouting === PARTNER_ROUTING.PARTNER) return true;
  return hasPartnerServiceItem(memo);
}

// 협력사가 기록하는 진행 단계. 완료 등록 → 본사 검수(승인/반려)는 본사 몫이다.
export const PARTNER_STATUSES = {
  RECEIVED: "RECEIVED",
  INSTALLER_ASSIGNED: "INSTALLER_ASSIGNED",
  SCHEDULED: "SCHEDULED",
  COMPLETION_SUBMITTED: "COMPLETION_SUBMITTED",
  COMPLETED: "COMPLETED",
  UNABLE: "UNABLE",
} as const;

export type PartnerStatus = (typeof PARTNER_STATUSES)[keyof typeof PARTNER_STATUSES];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  RECEIVED: "접수",
  INSTALLER_ASSIGNED: "기사 배정",
  SCHEDULED: "일정 확정",
  COMPLETION_SUBMITTED: "설치 완료 (본사 검수 중)",
  COMPLETED: "완료",
  UNABLE: "설치 불가",
};

// 협력사가 상태 변경 버튼으로 직접 고를 수 있는 단계. 완료는 사진과 함께 따로 등록한다.
export const PARTNER_SELECTABLE_STATUSES: readonly PartnerStatus[] = [
  PARTNER_STATUSES.RECEIVED,
  PARTNER_STATUSES.INSTALLER_ASSIGNED,
  PARTNER_STATUSES.SCHEDULED,
  PARTNER_STATUSES.UNABLE,
];

export function formatPartnerStatus(value: string | null | undefined) {
  if (!value) return "-";
  return PARTNER_STATUS_LABELS[value as PartnerStatus] ?? value;
}
