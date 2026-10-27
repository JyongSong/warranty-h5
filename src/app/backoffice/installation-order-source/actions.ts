"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  addErpOrderToInstallationQueue,
  ErpOrderManualAddError,
  lookupErpOrdersByNumber,
  type ErpOrderLookupItem,
} from "@/lib/installation/orders/source/manual-add";

export type LookupErpOrderActionResult =
  | { ok: true; items: ErpOrderLookupItem[] }
  | { ok: false; error: string };

export type AddErpOrderToQueueActionResult =
  | { ok: true; installationOrderId: string }
  | { ok: false; error: string };

export async function lookupErpOrderByNumberAction(query: string): Promise<LookupErpOrderActionResult> {
  const auth = await requireBackofficeAdmin();
  if (!auth.ok) return auth;

  try {
    return { ok: true, items: await lookupErpOrdersByNumber(query) };
  } catch (error) {
    return { ok: false, error: toErrorCode(error) };
  }
}

export async function addErpOrderToQueueAction(input: {
  query: string;
  sourceKey: string;
}): Promise<AddErpOrderToQueueActionResult> {
  const auth = await requireBackofficeAdmin();
  if (!auth.ok) return auth;

  try {
    const result = await addErpOrderToInstallationQueue(input);
    revalidatePath("/backoffice/installations");
    return { ok: true, installationOrderId: result.installationOrderId };
  } catch (error) {
    return { ok: false, error: toErrorCode(error) };
  }
}

async function requireBackofficeAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await getCurrentBackofficeUser();
    if (!admin) return { ok: false, error: "UNAUTHORIZED" };
    if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AUTH_ERROR" };
  }
}

function toErrorCode(error: unknown) {
  if (error instanceof ErpOrderManualAddError) return error.message;
  console.error("[installation-order-source/actions]", error);
  return "ERP_LOOKUP_FAILED";
}
