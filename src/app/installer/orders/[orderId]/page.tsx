import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
import OrderDetailClient from "./OrderDetailClient";

export const dynamic = "force-dynamic";

export default async function InstallerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const installer = await requireInstallerPage(`/installer/orders/${orderId}`);
  const item = await getInstallerOrderView(installer.id, orderId);
  if (!item) notFound();

  return <OrderDetailClient item={item} />;
}
