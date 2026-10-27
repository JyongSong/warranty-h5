import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePartnerWithCode } from "@/lib/partnerAuth";
import { getInstallationPartnerByCode } from "@/lib/installation/partner/service";
import { formatPartnerStatus } from "@/lib/installation/partner/routing";
import {
  countPartnerOrdersByView,
  listPartnerOrders,
  normalizePartnerOrderView,
  PARTNER_ORDER_VIEWS,
  type PartnerOrderView,
} from "@/lib/installation/partner/views";
import PartnerHeader from "./PartnerHeader";
import { formatInstallSchedule, formatPartnerDateTime, formatPartnerPhone } from "./format";

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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <PartnerHeader partnerName={partner.name} />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <nav className="mb-4 flex gap-2 overflow-x-auto">
          {(Object.keys(PARTNER_ORDER_VIEWS) as PartnerOrderView[]).map((key) => (
            <Link
              key={key}
              href={key === "active" ? "/partner/orders" : `/partner/orders?view=${key}`}
              className={[
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold",
                key === view
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500",
              ].join(" ")}
            >
              {PARTNER_ORDER_VIEWS[key].label} {counts[key]}
            </Link>
          ))}
        </nav>

        {orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
            {PARTNER_ORDER_VIEWS[view].label} 건이 없습니다.
          </p>
        ) : (
          <ul className="grid gap-3">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/partner/orders/${order.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-950">
                        {order.customerName ?? "고객명 없음"}
                        <span className="ml-2 text-sm font-medium text-zinc-500">
                          {formatPartnerPhone(order.customerPhone)}
                        </span>
                      </p>
                      <p className="mt-1 break-keep text-sm text-zinc-700">{order.address ?? "주소 없음"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                      {formatPartnerStatus(order.partnerStatus)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{order.memo ?? "-"}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>설치 희망 {formatInstallSchedule(order.installDate, order.installTimeSlot)}</span>
                    <span>배정 {formatPartnerDateTime(order.partnerAssignedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
