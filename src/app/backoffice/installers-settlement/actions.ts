"use server";

import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  SettlementError,
  collectLinesIntoPeriod,
  createSettlementPeriod,
  removeLineFromPeriod,
  setPeriodSettled,
} from "@/lib/installation/settlement/service";
import { upsertInstallerRateOverride } from "@/lib/installation/settlement/installer-rates";

export type SettlementActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const admin = await getCurrentBackofficeUser();
  if (!admin) return { ok: false, error: "UNAUTHORIZED" };
  if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };
  return { ok: true, adminId: admin.id };
}

function fail(error: unknown): SettlementActionResult {
  if (error instanceof SettlementError) return { ok: false, error: error.message };
  console.error("[action/settlement]", error);
  return { ok: false, error: "SETTLEMENT_ACTION_FAILED" };
}

export async function createSettlementPeriodAction(input: {
  name: string;
  startDate: string;
  endDate: string;
}): Promise<SettlementActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    await createSettlementPeriod({ adminId: auth.adminId, ...input });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function collectLinesIntoPeriodAction(
  periodId: string,
): Promise<SettlementActionResult & { count?: number }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    const count = await collectLinesIntoPeriod(periodId);
    return { ok: true, count };
  } catch (error) {
    return fail(error);
  }
}

export async function removeLineFromPeriodAction(lineId: string): Promise<SettlementActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    await removeLineFromPeriod(lineId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setPeriodSettledAction(input: {
  periodId: string;
  settled: boolean;
}): Promise<SettlementActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    await setPeriodSettled({ adminId: auth.adminId, ...input });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function upsertInstallerRateOverrideAction(input: {
  installerId: string;
  linkageAppFee: number | null;
  linkageHubFee: number | null;
  travelFee: number | null;
  nightSurcharge: number | null;
  weekendSurcharge: number | null;
}): Promise<SettlementActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  try {
    await upsertInstallerRateOverride(input);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
