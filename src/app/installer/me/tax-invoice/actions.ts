"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import {
  PopbillTaxInvoiceError,
  getPopbillCertRegisterUrl,
  isPopbillTaxInvoiceEnabled,
  verifyPopbillLink,
  type PopbillLinkStatus,
} from "@/lib/installer/popbill-tax-invoice";

export type VerifyResult = { ok: true; status: PopbillLinkStatus; invalidReason: string | null } | { ok: false; error: string };
export type UrlResult = { ok: true; url: string } | { ok: false; error: string };

function fail(scope: string, error: unknown): { ok: false; error: string } {
  if (error instanceof PopbillTaxInvoiceError) return { ok: false, error: error.message };
  console.error(`[installer/tax-invoice/${scope}]`, error);
  return { ok: false, error: "POPBILL_UNAVAILABLE" };
}

/** 「연동 확인」: 정산 정보의 사업자번호로 팝빌 가입·인증서를 확인해 저장한다. */
export async function verifyPopbillLinkAction(): Promise<VerifyResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  if (!(await isPopbillTaxInvoiceEnabled())) return { ok: false, error: "DISABLED" };
  try {
    const r = await verifyPopbillLink(installer.id);
    return { ok: true, ...r };
  } catch (error) {
    return fail("verify", error);
  }
}

/** 팝빌 인증서 등록 팝업 URL(30초 유효) */
export async function getCertRegisterUrlAction(): Promise<UrlResult> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false, error: "UNAUTHORIZED" };
  if (!(await isPopbillTaxInvoiceEnabled())) return { ok: false, error: "DISABLED" };
  try {
    return { ok: true, url: await getPopbillCertRegisterUrl(installer.id) };
  } catch (error) {
    return fail("cert-url", error);
  }
}
