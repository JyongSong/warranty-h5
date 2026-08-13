import { notFound, redirect } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerAsOrderView } from "@/lib/installer/asOrders";
import AsCompleteClient from "./AsCompleteClient";

export const dynamic = "force-dynamic";

export default async function InstallerAsCompletePage({
  params,
}: {
  params: Promise<{ asId: string }>;
}) {
  const { asId } = await params;
  const installer = await requireInstallerPage(`/installer/as/${asId}/complete`);
  const item = await getInstallerAsOrderView(installer.id, asId);
  if (!item) notFound();
  if (item.status !== "ACCEPTED") redirect(`/installer/as/${asId}`);

  return <AsCompleteClient asOrderId={asId} symptomLabel={`${item.symptomCode} · ${item.symptomLabel}`} />;
}
