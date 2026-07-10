"use server";

import {
  InstallerResponseError,
  respondInstallerAssignment,
} from "@/lib/installation/installer/response";

export type SubmitInstallerResponseResult = { ok: true } | { ok: false; error: string };

export async function submitInstallerResponseAction(input: {
  token: string;
  response: "ACCEPT" | "REJECT";
  rejectReason?: string | null;
}): Promise<SubmitInstallerResponseResult> {
  const token = input.token.trim();
  if (!token) return { ok: false, error: "MISSING_TOKEN" };

  try {
    await respondInstallerAssignment(token, {
      response: input.response,
      rejectReason: input.rejectReason ?? null,
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof InstallerResponseError) {
      return { ok: false, error: getPublicInstallerResponseErrorCode(error.message) };
    }

    console.error("[action/i/i]", error);
    return { ok: false, error: "INSTALLER_RESPONSE_FAILED" };
  }
}

function getPublicInstallerResponseErrorCode(error: string) {
  if (["ORDER_NOT_WAITING_INSTALLER_RESPONSE", "ASSIGNMENT_NOT_ACTIVE"].includes(error)) {
    return "ASSIGNMENT_NOT_WAITING_INSTALLER_RESPONSE";
  }
  if (error === "ASSIGNMENT_CANCELLED") {
    return "ASSIGNMENT_NOT_WAITING_INSTALLER_RESPONSE";
  }
  return error;
}
