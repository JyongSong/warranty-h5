import { requireInstallerPage } from "@/lib/installer/session";
import { getSettlementInfo, isTaxDocTypeEnabled } from "@/lib/installer/settlement-info";
import SettlementInfoClient from "./SettlementInfoClient";

export const dynamic = "force-dynamic";

export default async function InstallerSettlementInfoPage() {
  const installer = await requireInstallerPage("/installer/me/settlement-info");
  const [info, showTaxDocType] = await Promise.all([getSettlementInfo(installer.id), isTaxDocTypeEnabled()]);
  return <SettlementInfoClient info={info} showTaxDocType={showTaxDocType} />;
}
