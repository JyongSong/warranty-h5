"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { BACKOFFICE_READ_ONLY_ERROR, canEditBackoffice } from "@/lib/login/backofficeRoles";
import { SettlementInfoError, reviewSettlementInfo } from "@/lib/installer/settlement-info";

export type ReviewSettlementInfoResult = { ok: true } | { ok: false; error: string };

export async function reviewSettlementInfoAction(input: {
  installerId: string;
  approve: boolean;
  rejectReason?: string;
}): Promise<ReviewSettlementInfoResult> {
  const admin = await getCurrentBackofficeUser();
  if (!admin) return { ok: false, error: "UNAUTHORIZED" };
  if (!canEditBackoffice(admin.level)) return { ok: false, error: BACKOFFICE_READ_ONLY_ERROR };
  try {
    await reviewSettlementInfo({ ...input, adminId: admin.id });
    revalidatePath(`/backoffice/installers/${input.installerId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof SettlementInfoError) return { ok: false, error: error.message };
    console.error("[backoffice/installer/settlement-info/review]", error);
    return { ok: false, error: "REVIEW_FAILED" };
  }
}
