// 임시 진단(preview 전용, 값은 노출하지 않음). 확인 후 지운다.
import { NextResponse } from "next/server";
import { isPreviewSettlementOverride } from "@/lib/backoffice/system-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return new NextResponse(null, { status: 404 });
  const out: Record<string, unknown> = {
    vercelEnv: process.env.VERCEL_ENV ?? null,
    hasLinkId: Boolean(process.env.POPBILL_LINK_ID),
    hasSecret: Boolean(process.env.POPBILL_SECRET_KEY),
    isTest: process.env.POPBILL_IS_TEST ?? null,
    previewOverride: isPreviewSettlementOverride(),
  };
  try {
    const m = await import("@/lib/installer/popbill-tax-invoice");
    out.enabled = await m.isPopbillTaxInvoiceEnabled();
  } catch (e) {
    out.error = String(e).slice(0, 300);
  }
  try {
    const c = await import("@/lib/popbill/client");
    out.isMemberTest = await c.isMember("1234567890");
  } catch (e) {
    out.clientError = String(e).slice(0, 300);
  }
  return NextResponse.json(out);
}
