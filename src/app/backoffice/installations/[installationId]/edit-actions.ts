"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  AdminCustomerRequestEditError,
  updateCustomerRequestByAdmin,
} from "@/lib/installation/customer/admin-edit";
import { editApprovedCompletion, revertApprovedCompletion } from "@/lib/installation/completion/admin-edit";
import { InstallationCompletionError } from "@/lib/installation/completion/service";

export type AdminEditActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  try {
    const admin = await getCurrentBackofficeUser();
    if (!admin) return { ok: false, error: "UNAUTHORIZED" };
    if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };
    return { ok: true, adminId: admin.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AUTH_ERROR" };
  }
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/backoffice/installations/${orderId}`);
  revalidatePath(`/backoffice/installation-search/${orderId}`);
  revalidatePath("/backoffice/installations");
}

export async function updateCustomerRequestByAdminAction(input: {
  orderId: string;
  installAddress: string;
  installAddressDetail: string;
  installDate: string;
  installTimeSlot: string;
  customerPhone: string;
  reason: string;
}): Promise<AdminEditActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  try {
    const result = await updateCustomerRequestByAdmin({ ...input, adminId: auth.adminId });
    revalidateOrder(input.orderId);
    return {
      ok: true,
      message: result.candidateReselected
        ? "수정했습니다. 예전 주소/날짜로 뽑은 기사 후보는 무효로 하고 다시 찾았습니다."
        : "수정했습니다.",
    };
  } catch (error) {
    if (error instanceof AdminCustomerRequestEditError) return { ok: false, error: error.message };
    console.error("[action/installations/admin-edit-customer-request]", error);
    return { ok: false, error: "CUSTOMER_REQUEST_EDIT_FAILED" };
  }
}

export async function revertApprovedCompletionAction(input: {
  orderId: string;
  reason: string;
}): Promise<AdminEditActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  try {
    await revertApprovedCompletion({ ...input, adminId: auth.adminId });
    revalidateOrder(input.orderId);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallationCompletionError) return { ok: false, error: error.message };
    console.error("[action/installations/completion-revert]", error);
    return { ok: false, error: "COMPLETION_REVERT_FAILED" };
  }
}

export async function editApprovedCompletionAction(input: {
  orderId: string;
  reason: string;
  achievedAqaraAppCapability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  extraClaimAmount: number | null;
  extraClaimReason: string | null;
}): Promise<AdminEditActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  try {
    await editApprovedCompletion({ ...input, adminId: auth.adminId });
    revalidateOrder(input.orderId);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallationCompletionError) return { ok: false, error: error.message };
    console.error("[action/installations/completion-edit]", error);
    return { ok: false, error: "COMPLETION_EDIT_FAILED" };
  }
}
