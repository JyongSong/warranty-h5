import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SYSTEM_SETTING_KEYS,
  getEffectiveIntegerSetting,
} from "@/lib/backoffice/system-settings";

type Db = PrismaClient | Prisma.TransactionClient;

// The five configurable money rates plus the two night-window hour thresholds.
export type EffectiveRates = {
  linkageAppFee: number;
  linkageHubFee: number;
  travelFee: number;
  nightSurcharge: number;
  weekendSurcharge: number;
  nightStartHour: number;
  nightEndHour: number;
};

// Which money items came from a per-installer override vs the global default.
// Frozen into SettlementLine.rateSource for audit.
export type RateSource = {
  linkageAppFee: "override" | "default";
  linkageHubFee: "override" | "default";
  travelFee: "override" | "default";
  nightSurcharge: "override" | "default";
  weekendSurcharge: "override" | "default";
};

export type ResolvedRates = {
  rates: EffectiveRates;
  source: RateSource;
};

export async function getGlobalDefaults(): Promise<EffectiveRates> {
  const [
    linkageAppFee,
    linkageHubFee,
    travelFee,
    nightSurcharge,
    weekendSurcharge,
    nightStartHour,
    nightEndHour,
  ] = await Promise.all([
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementLinkageAppFee),
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementLinkageHubFee),
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementTravelFee),
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementNightSurcharge),
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementWeekendSurcharge),
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementNightStartHour),
    getEffectiveIntegerSetting(SYSTEM_SETTING_KEYS.settlementNightEndHour),
  ]);
  return {
    linkageAppFee,
    linkageHubFee,
    travelFee,
    nightSurcharge,
    weekendSurcharge,
    nightStartHour,
    nightEndHour,
  };
}

// Resolve the effective rates for one installer: global defaults, with any
// non-null column on the installer's installer_rates row overriding.
export async function resolveInstallerRates(
  installerId: string,
  db: Db = prisma,
): Promise<ResolvedRates> {
  const defaults = await getGlobalDefaults();
  const override = await db.installerRate.findUnique({ where: { installerId } });

  const pick = (
    value: number | null | undefined,
    fallback: number,
  ): [number, "override" | "default"] =>
    value === null || value === undefined ? [fallback, "default"] : [value, "override"];

  const [linkageAppFee, sLinkageApp] = pick(override?.linkageAppFee, defaults.linkageAppFee);
  const [linkageHubFee, sLinkageHub] = pick(override?.linkageHubFee, defaults.linkageHubFee);
  const [travelFee, sTravel] = pick(override?.travelFee, defaults.travelFee);
  const [nightSurcharge, sNight] = pick(override?.nightSurcharge, defaults.nightSurcharge);
  const [weekendSurcharge, sWeekend] = pick(override?.weekendSurcharge, defaults.weekendSurcharge);

  return {
    rates: {
      linkageAppFee,
      linkageHubFee,
      travelFee,
      nightSurcharge,
      weekendSurcharge,
      nightStartHour: defaults.nightStartHour,
      nightEndHour: defaults.nightEndHour,
    },
    source: {
      linkageAppFee: sLinkageApp,
      linkageHubFee: sLinkageHub,
      travelFee: sTravel,
      nightSurcharge: sNight,
      weekendSurcharge: sWeekend,
    },
  };
}
