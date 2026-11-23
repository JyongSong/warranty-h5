"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { BACKOFFICE_READ_ONLY_ERROR, canEditBackoffice } from "@/lib/login/backofficeRoles";
import {
  AdminManualOrderError,
  createAdminManualOrder,
  getNextAdminManualOrderNumber,
  type CreateAdminManualOrderInput,
} from "@/lib/installation/orders/source/admin-create";

export type CreateManualOrderActionResult =
  | { ok: true; installationOrderId: string; orderNumber: string; nextOrderNumber: string }
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
    // 다음 접수용 번호를 바로 돌려줘 폼을 새로 채운다. 실패해도 접수 결과에는 영향 없다.
    const nextOrderNumber = await getNextAdminManualOrderNumber().catch(() => "");
    return {
      ok: true,
      installationOrderId: result.installationOrderId,
      orderNumber: result.orderNumber,
      nextOrderNumber,
    };
  } catch (error) {
    if (error instanceof AdminManualOrderError) return { ok: false, error: error.message };
    console.error("[installation-order-manual/actions]", error);
    return { ok: false, error: "MANUAL_ORDER_CREATE_FAILED" };
  }
}
