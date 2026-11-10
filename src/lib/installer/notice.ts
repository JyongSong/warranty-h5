import { wallpadBillingOfItems, type PartnerInstallItem } from "@/lib/installation/partner/install-items";

// 기사 앱 공지·자주 묻는 질문·작업 상세 「이 건 안내」가 함께 쓰는 문안.
// 본사 설치비 기준 공지(10월 1일 설치 건부터 적용)를 옮긴 것이다. 기준이 바뀌면 이 파일만 고친다.
// 공지 팝업을 다시 띄우려면 INSTALLER_NOTICE.id 를 바꾼다(기사가 "확인"한 기록이 id 별로 남는다).

export type NoticeSection = {
  title: string;
  lines: string[];
  /** 한 단계 들여 쓴 세부 항목. lines 의 해당 줄 바로 뒤에 붙인다. */
  subLines?: Record<number, string[]>;
};

export const INSTALLER_NOTICE = {
  id: "install-fee-2026-10-v2",
  title: "설치비 기준 안내",
  effective: "2026년 10월 1일 설치 건부터 적용",
  intro: "현장 방문 및 고객 안내 시 아래 내용을 참고 부탁드립니다.",
} as const;

// (현장 결제) 월패드 연동: 본사가 고객에게 안내하는 금액. 기사는 현장 결제 때 참고만 한다(정해진 요금표가 아니다).
const WALLPAD_ONSITE_PRICE_LINES = [
  "연동기를 현장에서 구매하고 설치하는 경우: 약 12만 원",
  "연동기를 이미 보유하고 있어 설치만 진행하는 경우: 약 3만~5만 원",
  "비용은 현장 상황에 따라 달라질 수 있습니다.",
];

export const INSTALL_FEE_SECTIONS: NoticeSection[] = [
  {
    title: "1. 기본 설치비",
    lines: [
      "기본 설치비: 50,000원",
      "장거리 출장의 경우 아래 기준에 따라 기본 설치비와 별도로 장거리 비용이 지급됩니다.",
      "앱 설치 비용 5,000원 및 앱 설치 + 허브 연동 비용 20,000원은 현행 기준을 유지합니다.",
    ],
    subLines: {
      1: [
        "20km 초과~40km 이하: 20,000원",
        "40km 초과: 40,000원",
        "장거리 거리는 대리점(설치 기사님) 주소지와 고객 설치 주소지 간 **네이버 지도 기준 편도 최단 거리**로 판단합니다.",
        "장거리 비용은 설치 완료 후 설치 내역 및 거리 기준 확인을 거쳐 승인된 건에 한해 별도 지급됩니다.",
      ],
    },
  },
  {
    title: "2. 월패드 연동 설치비",
    lines: [
      "**(현장 결제)** 로 표시된 건은 월패드 연동 비용을 고객님께 현장에서 직접 결제받으시면 됩니다.",
      "아래는 **본사가 고객님께 안내하고 있는 금액**입니다. 현장에서 결제받으실 때 참고해 주세요.",
      "**(본사 청구)** 로 표시된 건은 고객님이 이미 결제한 건이므로 현장에서 따로 받지 않습니다. 50,000원이 정산에 포함됩니다.",
      "방문 후 현장 및 월패드 상태를 확인한 뒤 작업 가능 여부를 판단해 주세요.",
      "기존 월패드가 노후화되었거나 현장 환경상 연동 작업이 어렵다고 판단되는 경우, 무리하게 작업을 진행하지 마시고 작업 전 아카라라이프 측으로 확인 부탁드립니다.",
      "특히 작업이 불가능한 상태의 월패드는 설치를 진행하지 않도록 유의해 주세요.",
    ],
    subLines: {
      1: WALLPAD_ONSITE_PRICE_LINES,
    },
  },
  {
    title: "3. 도어벨 설치비",
    lines: [
      "**본사 청구** 건 도어벨 설치비: 50,000원 (완료 등록 시 **기타 청구 금액**으로 제출해 주세요)",
      "현장에서 고객님이 설치를 요청하시는 경우: 현장 환경에 따라 **50,000원~90,000원** (고객님께 현장에서 직접 결제)",
      "도어벨은 상시전원 설치 작업을 기준으로 합니다.",
      "설치 전 현장 상황 및 작업 가능 여부를 확인해 주세요.",
      "설치 과정에서 제품 또는 고객 시설물에 손상이 발생하지 않도록 작업에 유의 부탁드립니다.",
    ],
  },
];

export type FaqItem = { q: string; a: string };

// 기사님들이 전화로 자주 묻는 것. 답은 위 공지와 앱의 정산 규칙에서만 가져온다.
export const INSTALL_FAQ: FaqItem[] = [
  {
    q: "고객 휴대폰 앱 연동까지 해 드려야 하나요?",
    a: "앱 설치·허브 연동을 진행하시면 앱 설치 5,000원, 앱 설치 + 허브 연동 20,000원이 정산에 포함됩니다. 완료 등록 때 연동 화면 사진을 1장 이상 첨부해 주세요.",
  },
  {
    q: "월패드 연동 작업비는 고객에게 얼마를 받나요?",
    a: "작업 상세의 설치 품목을 확인해 주세요. (현장 결제) 표시 건은 고객님께 현장에서 직접 받습니다. 본사는 고객님께 「연동기를 현장에서 구매하고 설치하면 약 12만 원, 연동기를 이미 갖고 있어 설치만 하면 약 3만~5만 원이며 현장 상황에 따라 달라질 수 있다」고 안내하고 있으니, 현장에서 결제받으실 때 참고해 주세요. (본사 청구) 표시 건은 고객이 이미 결제한 건이라 따로 받지 않고, 50,000원이 정산에 포함됩니다.",
  },
  {
    q: "고객님이 현장에서 도어벨 설치를 요청하시면 얼마를 받나요?",
    a: "현장 환경에 따라 50,000원~90,000원을 고객님께 현장에서 직접 결제받으시면 됩니다. 본사로 접수된(본사 청구) 도어벨 설치 건은 50,000원이며, 완료 등록 때 「기타 청구 금액」에 50,000원과 사유(도어벨 설치)를 적어 제출해 주세요.",
  },
  {
    q: "장거리 비용은 어떻게 받나요?",
    a: "완료 등록 때 거리 구간(20km 초과~40km 이하 / 40km 초과)을 골라 주세요. 거리는 기사님 등록 주소와 고객 설치 주소 사이의 네이버 지도 기준 편도 최단 거리이며, 본사가 확인한 뒤 승인된 건만 지급됩니다.",
  },
  {
    q: "야간이나 주말에 설치하면 추가비가 있나요?",
    a: "10월 1일 설치 건부터 야간·주말/공휴일 추가비는 없습니다.",
  },
  {
    q: "정산은 언제 반영되나요?",
    a: "완료 등록 후 본사 검수가 끝나면 정산에 반영됩니다. 반영된 금액은 「이력·정산」 탭에서 확인하실 수 있습니다.",
  },
];

// --- 작업 상세 「이 건 안내」 ---

export type OrderGuideLine = { tone: "info" | "warn"; text: string };

const LONG_DISTANCE_TIERS = [
  { overKm: 40, amount: 40000, label: "40km 초과" },
  { overKm: 20, amount: 20000, label: "20km 초과~40km 이하" },
] as const;

export function longDistanceTier(drivingMeters: number | null) {
  if (drivingMeters === null) return null;
  const km = drivingMeters / 1000;
  return LONG_DISTANCE_TIERS.find((tier) => km > tier.overKm) ?? null;
}

function hasItem(items: PartnerInstallItem[], pattern: RegExp) {
  return items.some((item) => pattern.test(item.name));
}

/**
 * 이 주문에 해당하는 기준만 골라 짧게 보여 준다. 총판 대행 건은 정산 방식이 달라
 * (기본 출장비 + 기타 청구뿐) 따로 안내하므로 빈 배열을 돌려준다.
 */
export function buildOrderGuideLines({
  installItems,
  agentProxy,
  drivingMeters,
}: {
  installItems: PartnerInstallItem[];
  agentProxy: boolean;
  /** 기사 등록 주소 ↔ 고객 주소 경로 거리. 모르면 null */
  drivingMeters: number | null;
}): OrderGuideLine[] {
  if (agentProxy) return [];
  const lines: OrderGuideLine[] = [
    { tone: "info", text: "기본 설치비 50,000원" },
  ];

  const tier = longDistanceTier(drivingMeters);
  if (drivingMeters !== null) {
    const km = (drivingMeters / 1000).toFixed(1);
    lines.push(
      tier
        ? {
            tone: "info",
            text: `장거리 예상 ${tier.amount.toLocaleString("ko-KR")}원 (앱 계산 약 ${km}km, ${tier.label}) · 완료 등록 때 구간을 고르면 본사 확인 후 지급`,
          }
        : { tone: "info", text: `장거리 해당 없음 예상 (앱 계산 약 ${km}km, 20km 이하)` },
    );
  }
  // 앱 거리는 길찾기 경로라 기준(최단 거리)과 조금 다를 수 있다. 판단 기준을 함께 적는다.
  lines.push({ tone: "warn", text: "장거리 기준은 기사님 주소 ↔ 고객 주소의 네이버 지도 기준 편도 최단 거리입니다." });

  lines.push({
    tone: "info",
    text: "앱 설치 5,000원 / 앱 설치 + 허브 연동 20,000원 · 완료 등록 때 연동 화면 사진 필요",
  });

  const wallpad = wallpadBillingOfItems(installItems);
  if (wallpad.hq) {
    lines.push({
      tone: "warn",
      text: "(본사 청구) 월패드 연동: 고객이 이미 결제한 건입니다. 고객에게 따로 받지 마세요. 50,000원이 정산에 포함됩니다.",
    });
  }
  if (wallpad.onsite) {
    lines.push({
      tone: "warn",
      text: "(현장 결제) 월패드 연동: 고객님께 현장에서 직접 받습니다. 본사가 고객님께 안내한 금액(참고): 연동기 구매+설치 약 12만 원 / 연동기 보유·설치만 약 3만~5만 원, 현장 상황에 따라 다를 수 있음",
    });
  }
  if (wallpad.hq || wallpad.onsite || hasItem(installItems, /월패드/)) {
    lines.push({
      tone: "warn",
      text: "월패드가 노후되었거나 연동이 어려워 보이면 무리하게 진행하지 말고 작업 전 아카라라이프에 확인해 주세요.",
    });
  }

  if (hasItem(installItems, /도어벨/)) {
    lines.push({
      tone: "info",
      // 도어벨 설치비는 정산 항목이 따로 없어 기사가 기타 청구로 올린다.
      text: "도어벨 설치비 50,000원은 완료 등록 때 「기타 청구 금액」으로 제출해 주세요. 도어벨은 상시전원 설치 기준이며, 설치 전 작업 가능 여부를 확인하고 손상에 유의해 주세요.",
    });
  }

  return lines;
}
