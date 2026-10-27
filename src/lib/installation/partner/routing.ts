// 외부 협력사(PL) 배정 규칙.
//
// 조명·월패드 설치는 자사 도어락 기사가 못 하므로, 해당 설치비(용역) 품목이 든
// 주문은 도어락이 섞여 있어도 주문 전체를 협력사에 넘긴다. 제품명("월패드",
// "허브")이 아니라 설치비 품목명으로 판별해야 제품만 산 주문이 딸려가지 않는다.
// 품목명은 ERP 동기화가 원천 메모에 "품목명 x수량" 으로 남긴 그대로다.

export const PARTNER_SERVICE_ITEM_NAMES = [
  "조명 스위치 설치비", // 00011
  "슬림 면조명 설치", // 00024 용역 슬림 면조명 설치서비스
  "월패드 모듈 설치비", // 00019
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
