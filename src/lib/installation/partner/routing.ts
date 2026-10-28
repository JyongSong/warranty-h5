// 외부 협력사(PL) 배정 규칙.
//
// 자사 도어락 기사가 맡는 용역 품목(00010 출장비, 00012* 도어락 설치비, 00016, 00019 월패드 모듈,
// 00021, 00022, 00030*) 밖의 용역 품목이 하나라도 든 주문은, 도어락이 섞여 있어도 주문 전체를
// 협력사에 넘긴다. 품목명은 ERP 동기화가 원천 메모에 "품목명 x수량" 으로 남긴 MA_PITEM.NM_ITEM 그대로다.
// 코드 목록은 dispatch.ts 의 PARTNER_SERVICE_ITEM_CODES 와 맞춘다.

export const PARTNER_SERVICE_ITEM_NAMES = [
  "용역 조명 스위치 설치비", // 00011
  "용역 커튼레일 설치비", // 00013
  "용역 커튼레일(커튼 천 결합) 설치비", // 00013-1
  "용역 커튼/블라인드 실측 서비스", // 00013-2 (★ 접두어)
  "길이조절 커튼 레일 설치 + 출장비", // 00013-3 (용역 접두어 없음)
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

// 본사가 알아야 하는 협력사 진행 단계만 둔다: 접수했는지(청구 금액 입력), 언제 끝났는지(완료 등록).
// 협력사 안에서 기사를 고르고 일정을 잡는 과정은 협력사가 알아서 하고 여기 남기지 않는다.
export const PARTNER_STATUSES = {
  RECEIVED: "RECEIVED",
  ACCEPTED: "ACCEPTED",
  COMPLETION_SUBMITTED: "COMPLETION_SUBMITTED",
  COMPLETED: "COMPLETED",
  UNABLE: "UNABLE",
} as const;

export type PartnerStatus = (typeof PARTNER_STATUSES)[keyof typeof PARTNER_STATUSES];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  RECEIVED: "신규 (접수 전)",
  ACCEPTED: "접수 완료",
  COMPLETION_SUBMITTED: "설치 완료 (본사 검수 중)",
  COMPLETED: "완료",
  UNABLE: "설치 불가",
};

export function formatPartnerStatus(value: string | null | undefined) {
  if (!value) return "-";
  return PARTNER_STATUS_LABELS[value as PartnerStatus] ?? value;
}

// 협력사가 실제로 해야 하는 설치 작업만 원천 메모에서 뽑는다.
// 메모는 "품목명 x수량 / 품목명 x수량" 형식이고, 설치 작업은 "용역 ..." 품목(+ 접두어 없는 00013-3)이다.
// 출장비·용역매출은 작업이 아니라서 뺀다. 예) "용역 도어락 설치비(K100) x1" → { label: "도어락 K100 설치", quantity: 1 }
const NON_WORK_SERVICE_ITEMS = ["용역 출장비", "용역 용역매출", "용역매출"];
const UNPREFIXED_INSTALL_ITEMS = ["길이조절 커튼 레일 설치 + 출장비"];

export type PartnerInstallItem = { label: string; quantity: number };

export function parsePartnerInstallItems(memo: string | null | undefined): PartnerInstallItem[] {
  if (!memo) return [];

  const items: PartnerInstallItem[] = [];
  for (const segment of memo.split(" / ")) {
    const match = /^(.*?)\s*x\s*(\d+)\s*$/i.exec(segment.trim());
    const name = (match ? match[1] : segment).replace(/^★\s*/, "").trim();
    const quantity = match ? Number(match[2]) : 1;

    const isServiceItem = name.startsWith("용역") || UNPREFIXED_INSTALL_ITEMS.includes(name);
    if (!isServiceItem || NON_WORK_SERVICE_ITEMS.includes(name)) continue;

    items.push({ label: formatInstallItemLabel(name), quantity });
  }
  return items;
}

function formatInstallItemLabel(name: string) {
  return name
    .replace(/^용역\s*/, "")
    .replace(/\s*\([^)]*결제[^)]*\)/g, "") // (현장결제), (부자재 비용 현장 결제) 같은 결제 안내는 뺀다
    .replace(/설치비\s*\(([A-Za-z0-9]+)\)/, "$1 설치") // 도어락 설치비(K100) → 도어락 K100 설치
    .replace(/설치(비|서비스)/g, "설치")
    .trim();
}
