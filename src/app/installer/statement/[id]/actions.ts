"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentInstaller } from "@/lib/installer/session";
import { COMPLETION_PHOTO_BUCKET, createStatementEvidenceUploadTargets } from "@/lib/installer/storage";
import {
  StatementError,
  submitCashReceipt,
  submitTaxInvoiceEvidence,
} from "@/lib/installation/settlement/statements";
import {
  PopbillTaxInvoiceError,
  getStatementInvoiceViewUrl,
  issueStatementTaxInvoice,
} from "@/lib/installer/popbill-tax-invoice";

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

export type IssueResult = { ok: true; ntsConfirmNum: string | null } | { ok: false; error: string; detail?: string };

/** 팝빌 정발행. 성공하면 증빙 확인 완료로 바로 넘어간다. */
export async function issueTaxInvoiceAction(statementId: string): Promise<IssueResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  try {
    const r = await issueStatementTaxInvoice({ installerId: installer.id, statementId });
    return { ok: true, ntsConfirmNum: r.ntsConfirmNum };
  } catch (error) {
    if (error instanceof PopbillTaxInvoiceError) return { ok: false, error: error.message, detail: error.detail };
    console.error("[installer/statement/popbill-issue]", error);
    return { ok: false, error: "POPBILL_UNAVAILABLE" };
  }
}

/** 발행한 전자세금계산서 보기(팝빌 팝업, 30초 유효) */
export async function getInvoiceViewUrlAction(statementId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  try {
    return { ok: true, url: await getStatementInvoiceViewUrl(installer.id, statementId) };
  } catch (error) {
    if (!(error instanceof PopbillTaxInvoiceError)) console.error("[installer/statement/popbill-view]", error);
    return { ok: false, error: error instanceof PopbillTaxInvoiceError ? error.message : "POPBILL_UNAVAILABLE" };
  }
}
