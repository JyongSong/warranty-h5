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

export type SettlementLineItems = {
  linkageFee: number;
  travelFee: number;
  longDistanceFee: number;
  nightWeekendFee: number;
  serviceFee: number;
  wallpadAmount: number;
  totalAmount: number;
};

export type InstallBreakdown = {
  achievedAqaraAppCapability: string;
  night: boolean;
  weekend: boolean;
};

// Compute the frozen line items for an approved INSTALL completion.
// wallpadAmount is recorded (₩0 billing) — not added to the payable total.
export function computeInstallLineItems(input: {
  achievedAqaraAppCapability: string;
  longDistanceAmount: number | null;
  wallpadAmount: number | null;
  installEndAt: Date;
  rates: EffectiveRates;
}): { items: SettlementLineItems; breakdown: InstallBreakdown } {
  const { rates } = input;
  const linkageFee = linkageFeeForCapability(input.achievedAqaraAppCapability, rates);
  const travelFee = rates.travelFee;
  const longDistanceFee = Math.max(0, input.longDistanceAmount ?? 0);
  const night = isNight(input.installEndAt, rates.nightStartHour, rates.nightEndHour);
  const weekend = isWeekend(input.installEndAt);
  const nightWeekendFee = (night ? rates.nightSurcharge : 0) + (weekend ? rates.weekendSurcharge : 0);
  const wallpadAmount = Math.max(0, input.wallpadAmount ?? 0);

  const totalAmount = linkageFee + travelFee + longDistanceFee + nightWeekendFee;

  return {
    items: {
      linkageFee,
      travelFee,
      longDistanceFee,
      nightWeekendFee,
      serviceFee: 0,
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

// A/S line: payable = approved serviceFee only.
export function computeAsLineItems(serviceFee: number | null): SettlementLineItems {
  const fee = Math.max(0, serviceFee ?? 0);
  return {
    linkageFee: 0,
    travelFee: 0,
    longDistanceFee: 0,
    nightWeekendFee: 0,
    serviceFee: fee,
    wallpadAmount: 0,
    totalAmount: fee,
  };
}

export type { RateSource };
