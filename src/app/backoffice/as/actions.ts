"use server";

import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  AsOrderError,
  assignAsOrderInstaller,
  cancelAsOrder,
  createAsOrder,
  findOriginalInstallerForAs,
  recommendInstallersForAs,
  type AsInstallerRecommendation,
} from "@/lib/installation/as/service";

async function requireAsAdmin(): Promise<{ ok: true; admin: { id: string } } | { ok: false; error: string }> {
  try {
    const admin = await getCurrentBackofficeUser();
    if (!admin) return { ok: false, error: "UNAUTHORIZED" };
    if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };
    return { ok: true, admin: { id: admin.id } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AUTH_ERROR" };
  }
}

export type CreateAsOrderInput = {
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  symptomCode: string;
  symptomDetail?: string | null;
  orderNo?: string | null;
  originalInstallationOrderId?: string | null;
  memo?: string | null;
  assignInstallerId?: string | null;
};

export async function createAsOrderAction(
  input: CreateAsOrderInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireAsAdmin();
  if (!auth.ok) return auth;
  if (!input.symptomCode) return { ok: false, error: "SYMPTOM_CODE_REQUIRED" };

  try {
    const created = await createAsOrder({ adminId: auth.admin.id, ...input });
    return { ok: true, id: created.id };
  } catch (error) {
    if (error instanceof AsOrderError) return { ok: false, error: error.message };
    console.error("[as/create]", error);
    return { ok: false, error: "AS_CREATE_FAILED" };
  }
}

export async function lookupOriginalInstallerAction(input: {
  orderNo?: string;
  phone?: string;
}): Promise<
  | { ok: true; result: { installationOrderId: string; installerId: string; installerName: string } | null }
  | { ok: false; error: string }
> {
  const auth = await requireAsAdmin();
  if (!auth.ok) return auth;
  try {
    const result = await findOriginalInstallerForAs(input);
    return { ok: true, result };
  } catch (error) {
    console.error("[as/lookup-installer]", error);
    return { ok: false, error: "LOOKUP_FAILED" };
  }
}

export async function recommendAsInstallersAction(
  address: string,
): Promise<{ ok: true; recommendations: AsInstallerRecommendation[] } | { ok: false; error: string }> {
  const auth = await requireAsAdmin();
  if (!auth.ok) return auth;
  try {
    const recommendations = await recommendInstallersForAs(address);
    return { ok: true, recommendations };
  } catch (error) {
    console.error("[as/recommend]", error);
    return { ok: false, error: "RECOMMEND_FAILED" };
  }
}

export async function assignAsOrderAction(
  asOrderId: string,
  installerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAsAdmin();
  if (!auth.ok) return auth;
  try {
    await assignAsOrderInstaller({ adminId: auth.admin.id, asOrderId, installerId });
    return { ok: true };
  } catch (error) {
    if (error instanceof AsOrderError) return { ok: false, error: error.message };
    console.error("[as/assign]", error);
    return { ok: false, error: "AS_ASSIGN_FAILED" };
  }
}

export async function cancelAsOrderAction(
  asOrderId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAsAdmin();
  if (!auth.ok) return auth;
  try {
    await cancelAsOrder({ adminId: auth.admin.id, asOrderId, reason });
    return { ok: true };
  } catch (error) {
    if (error instanceof AsOrderError) return { ok: false, error: error.message };
    console.error("[as/cancel]", error);
    return { ok: false, error: "AS_CANCEL_FAILED" };
  }
}
