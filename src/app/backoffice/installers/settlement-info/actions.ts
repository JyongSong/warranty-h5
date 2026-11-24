"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { BACKOFFICE_READ_ONLY_ERROR, canEditBackoffice } from "@/lib/login/backofficeRoles";
import { SettlementInfoError, reviewSettlementInfo, setSettlementInfoTaxDocType } from "@/lib/installer/settlement-info";
import { sendSettlementInfoReminders } from "@/lib/installer/settlement-info-admin";

export type AdminResult = { ok: true; sent?: number; skipped?: number } | { ok: false; error: string };

const PATH = "/backoffice/installers/settlement-info";

async function requireEditor() {
  const admin = await getCurrentBackofficeUser();
  if (!admin) return { ok: false as const, error: "UNAUTHORIZED" };
  if (!canEditBackoffice(admin.level)) return { ok: false as const, error: BACKOFFICE_READ_ONLY_ERROR };
  return { ok: true as const, adminId: admin.id };
}

function fail(scope: string, error: unknown): AdminResult {
  if (error instanceof SettlementInfoError) return { ok: false, error: error.message };
  console.error(`[backoffice/settlement-info/${scope}]`, error);
  return { ok: false, error: "FAILED" };
}

/** 증빙 종류 변경(이력 남김) */
export async function setTaxDocTypeAction(installerId: string, taxDocType: string): Promise<AdminResult> {
  const auth = await requireEditor();
  if (!auth.ok) return auth;
  try {
    await setSettlementInfoTaxDocType({ installerId, taxDocType, adminId: auth.adminId });
    revalidatePath(PATH);
    revalidatePath(`/backoffice/installers/${installerId}`);
    return { ok: true };
  } catch (error) {
    return fail("set-type", error);
  }
}

/** 목록에서 바로 승인(반려는 사유가 필요해 기사 상세에서) */
export async function approveSettlementInfoAction(installerId: string): Promise<AdminResult> {
  const auth = await requireEditor();
  if (!auth.ok) return auth;
  try {
    await reviewSettlementInfo({ installerId, approve: true, adminId: auth.adminId });
    revalidatePath(PATH);
    revalidatePath(`/backoffice/installers/${installerId}`);
    return { ok: true };
  } catch (error) {
    return fail("approve", error);
  }
}

/** 미등록·증빙 종류 미선택 기사에게 앱 알림 */
export async function remindSettlementInfoAction(installerIds: string[]): Promise<AdminResult> {
  const auth = await requireEditor();
  if (!auth.ok) return auth;
  try {
    const r = await sendSettlementInfoReminders(installerIds);
    return { ok: true, ...r };
  } catch (error) {
    return fail("remind", error);
  }
}
