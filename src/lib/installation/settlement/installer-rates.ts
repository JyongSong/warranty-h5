import { prisma } from "@/lib/prisma";
import { SettlementError } from "./service";

export type InstallerRateOverrideView = {
  installerId: string;
  installerName: string;
  linkageAppFee: number | null;
  linkageHubFee: number | null;
  travelFee: number | null;
  nightSurcharge: number | null;
  weekendSurcharge: number | null;
};

const RATE_FIELDS = [
  "linkageAppFee",
  "linkageHubFee",
  "travelFee",
  "nightSurcharge",
  "weekendSurcharge",
] as const;
type RateField = (typeof RATE_FIELDS)[number];

// List every installer with their override row (nulls = using global default).
export async function listInstallerRateOverrides(): Promise<InstallerRateOverrideView[]> {
  const installers = await prisma.installer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, rateOverride: true },
  });
  return installers.map((i) => ({
    installerId: i.id,
    installerName: i.name,
    linkageAppFee: i.rateOverride?.linkageAppFee ?? null,
    linkageHubFee: i.rateOverride?.linkageHubFee ?? null,
    travelFee: i.rateOverride?.travelFee ?? null,
    nightSurcharge: i.rateOverride?.nightSurcharge ?? null,
    weekendSurcharge: i.rateOverride?.weekendSurcharge ?? null,
  }));
}

// Upsert a per-installer override. Each field: a non-negative integer to
// override, or null to fall back to the global default.
export async function upsertInstallerRateOverride(input: {
  installerId: string;
  linkageAppFee: number | null;
  linkageHubFee: number | null;
  travelFee: number | null;
  nightSurcharge: number | null;
  weekendSurcharge: number | null;
}): Promise<void> {
  const installer = await prisma.installer.findUnique({
    where: { id: input.installerId },
    select: { id: true },
  });
  if (!installer) throw new SettlementError("INSTALLER_NOT_FOUND");

  const data: Record<RateField, number | null> = {
    linkageAppFee: null,
    linkageHubFee: null,
    travelFee: null,
    nightSurcharge: null,
    weekendSurcharge: null,
  };
  for (const field of RATE_FIELDS) {
    const value = input[field];
    if (value === null) {
      data[field] = null;
    } else if (Number.isInteger(value) && value >= 0 && value <= 10_000_000) {
      data[field] = value;
    } else {
      throw new SettlementError("RATE_VALUE_INVALID");
    }
  }

  await prisma.installerRate.upsert({
    where: { installerId: input.installerId },
    create: { installerId: input.installerId, ...data },
    update: data,
  });
}
