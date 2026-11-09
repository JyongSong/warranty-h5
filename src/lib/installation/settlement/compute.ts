import type { EffectiveRates, RateSource } from "./rates";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// §6.4C: linkage fee is billed by the ACTUAL achieved capability.
// DOORLOCK_AND_APP → app fee; DOORLOCK_AND_APP_AND_HUB → hub fee (includes app); NONE → 0.
export function linkageFeeForCapability(
  achieved: string,
  rates: Pick<EffectiveRates, "linkageAppFee" | "linkageHubFee">,
): number {
  if (achieved === "DOORLOCK_AND_APP_AND_HUB") return rates.linkageHubFee;
  if (achieved === "DOORLOCK_AND_APP") return rates.linkageAppFee;
  return 0;
}

/**
 * 야간/휴일 할증은 폐지됐다. 이 시각 전에 처음 제출된 완료 건만 옛 규칙대로
 * 할증을 계산한다 — 기사가 제출할 때 할증이 포함된 금액을 보고 올린 건이라
 * 승인 시점에 금액이 줄면 안 된다. 그 뒤에 제출된 건은 할증이 없다.
 */
export const NIGHT_WEEKEND_SURCHARGE_ENDED_AT = new Date("2026-10-08T00:00:00+09:00");

export function isSurchargeEligible(firstSubmittedAt: Date): boolean {
  return firstSubmittedAt.getTime() < NIGHT_WEEKEND_SURCHARGE_ENDED_AT.getTime();
}

// Night/weekend judged from the install-end instant in KST.
export function isNight(installEndAt: Date, nightStartHour: number, nightEndHour: number): boolean {
  const kstHour = new Date(installEndAt.getTime() + KST_OFFSET_MS).getUTCHours();
  // Window wraps midnight when start > end (e.g. 20:00 → 06:00).
  if (nightStartHour <= nightEndHour) {
    return kstHour >= nightStartHour && kstHour < nightEndHour;
  }
  return kstHour >= nightStartHour || kstHour < nightEndHour;
}

// UI 문안은 "야간/휴일"이지만 여기서 보는 건 토·일요일뿐이다.
// 법정공휴일(설날·추석처럼 음력에 걸린 날 포함)은 반영되지 않는다.
export function isWeekend(installEndAt: Date): boolean {
  const kstDay = new Date(installEndAt.getTime() + KST_OFFSET_MS).getUTCDay();
  return kstDay === 0 || kstDay === 6; // Sun | Sat
}

/** 월패드 본사 청구 금액. 고객이 온라인으로 결제한 건이라 기사가 본사에 청구한다. 금액은 고정. */
export const WALLPAD_HQ_FEE = 50000;

export const WALLPAD_BILLINGS = ["HQ", "ONSITE"] as const;
export type WallpadBilling = (typeof WALLPAD_BILLINGS)[number];

export type SettlementLineItems = {
  linkageFee: number;
  travelFee: number;
  longDistanceFee: number;
  nightWeekendFee: number;
  serviceFee: number;
  /** 기타 청구 — 본사가 승인한 금액 */
  extraClaimFee: number;
  /** 월패드 본사 청구(정산 포함). 현장 결제 건은 0 */
  wallpadFee: number;
  /** 월패드 현장 수금(참고용, 정산 미포함) */
  wallpadAmount: number;
  totalAmount: number;
};

export type InstallBreakdown = {
  achievedAqaraAppCapability: string;
  night: boolean;
  weekend: boolean;
  /** 총판 대행 건. 월 정산·이력에서 「대행」 표시에 쓴다. 일반 건에는 없다. */
  agentProxy?: true;
};

/** 총판 대행 기본 출장비의 처음 기본값. 본사 단가 설정(시스템 설정)에서 바꿀 수 있다. */
export const AGENT_PROXY_DEFAULT_BASE_FEE = 50000;

/** 총판 대행 금액 입력 상한(원). 오타로 자릿수가 늘어난 값을 막는 정도의 범위다. */
export const AGENT_PROXY_FEE_MAX = 10000000;

// Compute the frozen line items for an approved INSTALL completion.
// 월패드: 본사 청구(HQ)면 고정 금액을 정산에 넣는다. 현장 결제면 wallpadAmount 는
// 기사가 고객에게 직접 받은 금액이라 기록만 하고 정산 합계에는 넣지 않는다.
export function computeInstallLineItems(input: {
  achievedAqaraAppCapability: string;
  longDistanceAmount: number | null;
  extraClaimAmount?: number | null;
  wallpadAmount: number | null;
  /** HQ | ONSITE. 비어 있으면(이 항목이 생기기 전 제출) 현장 결제로 본다. */
  wallpadBilling?: string | null;
  installEndAt: Date;
  /** 완료 건이 처음 제출된 시각. 할증 폐지 전 건인지 가린다. */
  firstSubmittedAt: Date;
  rates: EffectiveRates;
  /**
   * 총판 대행 건의 기본 출장비. 값이 있으면 대행 건이라 정산은 이 금액 + 기타 청구뿐이다
   * (연동비·장거리·할증·월패드 없음, 기사 단가도 쓰지 않는다).
   */
  agentProxyBaseFee?: number | null;
}): { items: SettlementLineItems; breakdown: InstallBreakdown } {
  const { rates } = input;
  if (input.agentProxyBaseFee !== null && input.agentProxyBaseFee !== undefined) {
    return computeAgentProxyLineItems({
      baseFee: input.agentProxyBaseFee,
      extraClaimAmount: input.extraClaimAmount ?? null,
    });
  }
  const linkageFee = linkageFeeForCapability(input.achievedAqaraAppCapability, rates);
  const travelFee = rates.travelFee;
  const longDistanceFee = Math.max(0, input.longDistanceAmount ?? 0);
  const extraClaimFee = Math.max(0, input.extraClaimAmount ?? 0);
  const eligible = isSurchargeEligible(input.firstSubmittedAt);
  const night = eligible && isNight(input.installEndAt, rates.nightStartHour, rates.nightEndHour);
  const weekend = eligible && isWeekend(input.installEndAt);
  const nightWeekendFee = (night ? rates.nightSurcharge : 0) + (weekend ? rates.weekendSurcharge : 0);
  const hqWallpad = input.wallpadBilling === "HQ";
  const wallpadFee = hqWallpad ? WALLPAD_HQ_FEE : 0;
  const wallpadAmount = hqWallpad ? 0 : Math.max(0, input.wallpadAmount ?? 0);

  const totalAmount = linkageFee + travelFee + longDistanceFee + nightWeekendFee + extraClaimFee + wallpadFee;

  return {
    items: {
      linkageFee,
      travelFee,
      longDistanceFee,
      nightWeekendFee,
      serviceFee: 0,
      extraClaimFee,
      wallpadFee,
      wallpadAmount,
      totalAmount,
    },
    breakdown: {
      achievedAqaraAppCapability: input.achievedAqaraAppCapability,
      night,
      weekend,
    },
  };
}

// 총판 대행 건: 기본 출장비 + 기타 청구. 나머지 항목은 0 이다.
export function computeAgentProxyLineItems(input: {
  baseFee: number;
  extraClaimAmount: number | null;
}): { items: SettlementLineItems; breakdown: InstallBreakdown } {
  const travelFee = Math.max(0, input.baseFee);
  const extraClaimFee = Math.max(0, input.extraClaimAmount ?? 0);
  return {
    items: {
      linkageFee: 0,
      travelFee,
      longDistanceFee: 0,
      nightWeekendFee: 0,
      serviceFee: 0,
      extraClaimFee,
      wallpadFee: 0,
      wallpadAmount: 0,
      totalAmount: travelFee + extraClaimFee,
    },
    breakdown: {
      achievedAqaraAppCapability: "NONE",
      night: false,
      weekend: false,
      agentProxy: true,
    },
  };
}

// A/S line: payable = approved serviceFee only.
export function computeAsLineItems(serviceFee: number | null): SettlementLineItems {
  const fee = Math.max(0, serviceFee ?? 0);
  return {
    linkageFee: 0,
    travelFee: 0,
    longDistanceFee: 0,
    nightWeekendFee: 0,
    serviceFee: fee,
    extraClaimFee: 0,
    wallpadFee: 0,
    wallpadAmount: 0,
    totalAmount: fee,
  };
}

export type { RateSource };

/**
 * `datetime-local` 입력값("2026-08-20T15:23")을 KST 벽시계 시각으로 읽는다.
 *
 * 이 문자열에는 타임존이 없어서 `new Date(value)` 는 실행 환경의 로컬 존으로
 * 해석한다. 서버(Vercel)는 UTC 라 15:23 이 15:23Z = KST 다음날 00:23 로
 * 저장됐고, 그 결과 야간 할증이 잘못 붙었다. 기사가 입력한 건 언제나 한국
 * 현지 시각이므로 여기서 KST 로 못박는다.
 *
 * 형식이 어긋나면 null 을 돌려준다 (호출부가 입력 오류로 처리한다).
 */
export function parseKstDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi, sec] = match;
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(sec ?? "0"),
  );
  const parsed = new Date(utcMs - KST_OFFSET_MS);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
