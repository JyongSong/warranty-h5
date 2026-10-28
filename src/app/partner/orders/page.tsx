import { notFound } from "next/navigation";
import { requirePartnerWithCode } from "@/lib/partnerAuth";
import { getInstallationPartnerByCode } from "@/lib/installation/partner/service";
import {
  countPartnerOrdersByView,
  getPartnerCompletedSummary,
  listPartnerOrders,
  normalizePartnerCompletedRange,
  normalizePartnerOrderView,
  toKstYmd,
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

  const params = await searchParams;
  const view = normalizePartnerOrderView(params.view);
  const range = normalizePartnerCompletedRange(params.from, params.to);
  const [orders, counts, completedSummary] = await Promise.all([
    view === "completed" ? Promise.resolve([]) : listPartnerOrders(partner.id, view),
    countPartnerOrdersByView(partner.id),
    view === "completed" ? getPartnerCompletedSummary(partner.id, range) : Promise.resolve(null),
  ]);

  return (
    <PartnerOrderListView
      partnerName={partner.name}
      view={view}
      orders={orders}
      counts={counts}
      completed={completedSummary ? { range, summary: completedSummary, today: toKstYmd(new Date()) } : undefined}
    />
  );
}
