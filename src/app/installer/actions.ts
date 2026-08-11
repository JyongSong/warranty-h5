"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentInstaller, clearInstallerSessionCookie } from "@/lib/installer/session";
import { InstallerResponseError, respondToAssignmentAsInstaller } from "@/lib/installer/respond";

export type RespondResult = { ok: true } | { ok: false; error: string };

export async function respondToAssignmentAction(input: {
  attemptId: string;
  response: "ACCEPT" | "REJECT";
  rejectReason?: string | null;
}): Promise<RespondResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };

  try {
    await respondToAssignmentAsInstaller(installer.id, input.attemptId, {
      response: input.response,
      rejectReason: input.rejectReason ?? null,
    });
    revalidatePath("/installer");
    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerResponseError) return { ok: false, error: error.message };
    console.error("[installer/respond]", error);
    return { ok: false, error: "RESPONSE_FAILED" };
  }
}

export async function logoutInstallerAction() {
  await clearInstallerSessionCookie();
  redirect("/installer/login");
}
