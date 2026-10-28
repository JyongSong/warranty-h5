import { notFound } from "next/navigation";
import { requirePartnerWithCode } from "@/lib/partnerAuth";
import { getInstallationPartnerByCode } from "@/lib/installation/partner/service";
import { getPartnerOrderDetail } from "@/lib/installation/partner/views";
import PartnerOrderDetailView from "./PartnerOrderDetailView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export default async function PartnerOrderDetailPage({ params }: PageProps) {
  const account = await requirePartnerWithCode("PL");
  const partner = await getInstallationPartnerByCode(account.partnerCode);
  if (!partner) notFound();

  const { orderId } = await params;
  const order = await getPartnerOrderDetail(orderId, { partnerId: partner.id });
  if (!order) notFound();

  return <PartnerOrderDetailView partnerName={partner.name} order={order} />;
}
