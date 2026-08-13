import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerAsOrderView } from "@/lib/installer/asOrders";
import AsDetailClient from "./AsDetailClient";

export const dynamic = "force-dynamic";

export default async function InstallerAsDetailPage({
  params,
}: {
  params: Promise<{ asId: string }>;
}) {
  const { asId } = await params;
  const installer = await requireInstallerPage(`/installer/as/${asId}`);
  const item = await getInstallerAsOrderView(installer.id, asId);
  if (!item) notFound();

  return <AsDetailClient item={item} />;
}
