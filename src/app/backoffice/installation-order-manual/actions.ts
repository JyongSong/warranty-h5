"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { BACKOFFICE_READ_ONLY_ERROR, canEditBackoffice } from "@/lib/login/backofficeRoles";
import {
  AdminManualOrderError,
  createAdminManualOrder,
  type CreateAdminManualOrderInput,
} from "@/lib/installation/orders/source/admin-create";

export type CreateManualOrderActionResult =
  | { ok: true; installationOrderId: string }
  | { ok: false; error: string };

export async function createManualOrderAction(
  input: Omit<CreateAdminManualOrderInput, "adminId" | "now">,
): Promise<CreateManualOrderActionResult> {
  let adminId: string;
  try {
    const admin = await getCurrentBackofficeUser();
    if (!admin) return { ok: false, error: "UNAUTHORIZED" };
    if (!canEditBackoffice(admin.level)) return { ok: false, error: BACKOFFICE_READ_ONLY_ERROR };
    adminId = admin.id;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AUTH_ERROR" };
  }

  try {
    const result = await createAdminManualOrder({ ...input, adminId });
    revalidatePath("/backoffice/installations");
    return { ok: true, installationOrderId: result.installationOrderId };
  } catch (error) {
    if (error instanceof AdminManualOrderError) return { ok: false, error: error.message };
    console.error("[installation-order-manual/actions]", error);
    return { ok: false, error: "MANUAL_ORDER_CREATE_FAILED" };
  }
}
