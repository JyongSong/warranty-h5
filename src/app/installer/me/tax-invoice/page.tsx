import { redirect } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import {
  getPopbillLinkView,
  isPopbillTaxInvoiceEnabled,
  popbillLinkId,
  popbillSignupUrl,
} from "@/lib/installer/popbill-tax-invoice";
import TaxInvoiceLinkClient from "./TaxInvoiceLinkClient";

export const dynamic = "force-dynamic";

export default async function InstallerTaxInvoiceLinkPage() {
  const installer = await requireInstallerPage("/installer/me/tax-invoice");
  // 공개 전에는 링크를 알아도 들어올 수 없게 한다.
  if (!(await isPopbillTaxInvoiceEnabled())) redirect("/installer/me");
  const view = await getPopbillLinkView(installer.id);
  return <TaxInvoiceLinkClient view={view} linkId={popbillLinkId()} signupUrl={popbillSignupUrl()} />;
}
