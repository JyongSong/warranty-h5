"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import { AsOrderError, respondToAsAssignmentAsInstaller } from "@/lib/installation/as/service";

export type AsRespondResult = { ok: true } | { ok: false; error: string };

export async function respondToAsAction(input: {
  asOrderId: string;
  response: "ACCEPT" | "REJECT";
  rejectReason?: string | null;
}): Promise<AsRespondResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  try {
    await respondToAsAssignmentAsInstaller({
      installerId: installer.id,
      asOrderId: input.asOrderId,
      response: input.response,
      rejectReason: input.rejectReason ?? null,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AsOrderError) return { ok: false, error: error.message };
    console.error("[installer/as/respond]", error);
    return { ok: false, error: "RESPONSE_FAILED" };
  }
}
