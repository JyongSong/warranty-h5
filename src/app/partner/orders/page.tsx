import { notFound } from "next/navigation";
import { requirePartnerWithCode } from "@/lib/partnerAuth";
import { getInstallationPartnerByCode } from "@/lib/installation/partner/service";
import {
  countPartnerOrdersByView,
  listPartnerOrders,
  normalizePartnerOrderView,
} from "@/lib/installation/partner/views";
import PartnerOrderListView from "./PartnerOrderListView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PartnerOrdersPage({ searchParams }: PageProps) {
  const account = await requirePartnerWithCode("PL");
  const partner = await getInstallationPartnerByCode(account.partnerCode);
  if (!partner) notFound();

  const view = normalizePartnerOrderView((await searchParams).view);
  const [orders, counts] = await Promise.all([
    listPartnerOrders(partner.id, view),
    countPartnerOrdersByView(partner.id),
  ]);

  return <PartnerOrderListView partnerName={partner.name} view={view} orders={orders} counts={counts} />;
}
