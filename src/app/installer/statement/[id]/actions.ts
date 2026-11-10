"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentInstaller } from "@/lib/installer/session";
import { COMPLETION_PHOTO_BUCKET, createStatementEvidenceUploadTargets } from "@/lib/installer/storage";
import {
  StatementError,
  submitCashReceipt,
  submitTaxInvoiceEvidence,
} from "@/lib/installation/settlement/statements";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type UploadTargetsResult =
  | { ok: true; bucket: string; targets: Array<{ path: string; token: string }> }
  | { ok: false; error: string };

/** 증빙 사진 업로드 자리. 본인 정산서일 때만 준다. */
export async function getEvidenceUploadTargetsAction(statementId: string, count: number): Promise<UploadTargetsResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  if (!Number.isInteger(count) || count < 1 || count > 3) return { ok: false, error: "PHOTO_COUNT_INVALID" };
  const own = await prisma.settlementStatement.findFirst({
    where: { id: statementId, installerId: installer.id },
    select: { id: true },
  });
  if (!own) return { ok: false, error: "NOT_FOUND" };
  try {
    const targets = await createStatementEvidenceUploadTargets(statementId, count);
    return { ok: true, bucket: COMPLETION_PHOTO_BUCKET, targets };
  } catch (error) {
    console.error("[installer/statement/upload-targets]", error);
    return { ok: false, error: "UPLOAD_TARGET_FAILED" };
  }
}

function fail(error: unknown): ActionResult {
  if (error instanceof StatementError) return { ok: false, error: error.message };
  console.error("[installer/statement/submit]", error);
  return { ok: false, error: "SAVE_FAILED" };
}

export async function submitTaxInvoiceAction(input: {
  statementId: string;
  photoPaths: string[];
  issueDate: string;
}): Promise<ActionResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  try {
    await submitTaxInvoiceEvidence({ installerId: installer.id, ...input });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function submitCashReceiptAction(input: {
  statementId: string;
  receiptNo: string;
  receiptDate: string;
  photoPaths: string[];
}): Promise<ActionResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  try {
    await submitCashReceipt({ installerId: installer.id, ...input });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
