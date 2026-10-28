"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  addPartnerNote,
  InstallationPartnerError,
  reviewPartnerCompletion,
  switchOrderToInhouse,
  switchOrderToPartner,
} from "@/lib/installation/partner/service";

export type BackofficePartnerActionResult = { ok: true } | { ok: false; error: string };

export async function switchOrderToPartnerAction(input: {
  installationId: string;
  reason?: string | null;
}): Promise<BackofficePartnerActionResult> {
  return runAsAdmin(input.installationId, (adminId) =>
    switchOrderToPartner(input.installationId, { adminId, reason: input.reason }),
  );
}

export async function switchOrderToInhouseAction(input: {
  installationId: string;
  reason: string;
}): Promise<BackofficePartnerActionResult> {
  return runAsAdmin(input.installationId, (adminId) =>
    switchOrderToInhouse(input.installationId, { adminId, reason: input.reason }),
  );
}

export async function reviewPartnerCompletionAction(input: {
  installationId: string;
  approve: boolean;
  reason?: string | null;
}): Promise<BackofficePartnerActionResult> {
  return runAsAdmin(input.installationId, (adminId) =>
    reviewPartnerCompletion(input.installationId, { adminId, approve: input.approve, reason: input.reason }),
  );
}

export async function addHqPartnerNoteAction(input: {
  installationId: string;
  body: string;
}): Promise<BackofficePartnerActionResult> {
  return runAsAdmin(input.installationId, (adminId) =>
    addPartnerNote(input.installationId, { authorType: "HQ", partnerId: null, userId: adminId, body: input.body }),
  );
}

async function runAsAdmin(
  installationId: string,
  operation: (adminId: string) => Promise<unknown>,
): Promise<BackofficePartnerActionResult> {
  try {
    const admin = await getCurrentBackofficeUser();
    if (!admin) return { ok: false, error: "UNAUTHORIZED" };
    if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };

    await operation(admin.id);
    revalidatePath("/backoffice/installations");
    revalidatePath(`/backoffice/installations/${installationId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallationPartnerError) return { ok: false, error: error.message };
    console.error("[backoffice/partner-actions]", error);
    return { ok: false, error: "PARTNER_ACTION_FAILED" };
  }
}
