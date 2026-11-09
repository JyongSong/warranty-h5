import { notFound, redirect } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
import { getAgentProxyBaseFeeDefault, resolveInstallerRates } from "@/lib/installation/settlement/rates";
import { listWallpadModelNames } from "@/lib/installation/wallpad/service";
import { wallpadBillingOfItems } from "@/lib/installation/partner/install-items";
import { WALLPAD_HQ_FEE } from "@/lib/installation/settlement/compute";
import CompleteClient from "./CompleteClient";
import AgentProxyCompleteClient from "./AgentProxyCompleteClient";

export const dynamic = "force-dynamic";

export default async function InstallerCompletePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const installer = await requireInstallerPage(`/installer/orders/${orderId}/complete`);
  const view = await getInstallerOrderView(installer.id, orderId);
  if (!view) notFound();
  if (view.status !== "ACCEPTED") redirect(`/installer/orders/${orderId}`);

  // 총판 대행 건은 기본 출장비 + 기타 청구 + 실제 시공자만 받는 별도 양식이다(사진 선택).
  if (view.agentProxy) {
    return (
      <AgentProxyCompleteClient
        orderId={orderId}
        erpOrderNo={view.erpOrderNo}
        address={view.address ?? ""}
        defaultBaseFee={view.agentProxyBaseFee ?? (await getAgentProxyBaseFeeDefault())}
      />
    );
  }

  const [{ rates }, wallpadModels] = await Promise.all([
    resolveInstallerRates(installer.id),
    listWallpadModelNames(),
  ]);

  return (
    <CompleteClient
      orderId={orderId}
      erpOrderNo={view.erpOrderNo}
      address={view.address ?? ""}
      linkageAppFee={rates.linkageAppFee}
      linkageHubFee={rates.linkageHubFee}
      wallpadModels={wallpadModels}
      orderWallpadBilling={wallpadBillingOfItems(view.installItems)}
      wallpadHqFee={WALLPAD_HQ_FEE}
    />
  );
}
