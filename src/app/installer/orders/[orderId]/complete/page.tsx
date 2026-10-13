import { notFound, redirect } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
import { resolveInstallerRates } from "@/lib/installation/settlement/rates";
import CompleteClient from "./CompleteClient";

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

  const { rates } = await resolveInstallerRates(installer.id);

  return (
    <CompleteClient
      orderId={orderId}
      erpOrderNo={view.erpOrderNo}
      address={view.address ?? ""}
      linkageAppFee={rates.linkageAppFee}
      linkageHubFee={rates.linkageHubFee}
    />
  );
}
