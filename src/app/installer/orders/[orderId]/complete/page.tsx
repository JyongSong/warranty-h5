import { notFound, redirect } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
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

  return <CompleteClient orderId={orderId} erpOrderNo={view.erpOrderNo} address={view.address ?? ""} />;
}
