import { redirect } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { isSettlementLaunched } from "@/lib/installation/settlement/statements";
import { getSettlementInfo, isTaxDocTypeEnabled } from "@/lib/installer/settlement-info";
import SettlementInfoClient from "./SettlementInfoClient";

export const dynamic = "force-dynamic";

export default async function InstallerSettlementInfoPage() {
  const installer = await requireInstallerPage("/installer/me/settlement-info");
  // 공개 전에는 링크를 알아도 들어올 수 없게 한다.
  if (!(await isSettlementLaunched())) redirect("/installer/me");
  const [info, showTaxDocType] = await Promise.all([getSettlementInfo(installer.id), isTaxDocTypeEnabled()]);
  return <SettlementInfoClient info={info} showTaxDocType={showTaxDocType} />;
}
