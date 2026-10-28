import Link from "next/link";
import { formatPartnerStatus } from "@/lib/installation/partner/routing";
import {
  PARTNER_ORDER_VIEWS,
  type PartnerCompletedRange,
  type PartnerCompletedSummary,
  type PartnerOrderSummary,
  type PartnerOrderView,
} from "@/lib/installation/partner/views";
import PartnerCompletedSection from "./PartnerCompletedSection";
import PartnerHeader from "./PartnerHeader";
import RowCell from "./PartnerRowCell";
import {
  formatClaimAmount,
  formatInstallSchedule,
  formatPartnerDateTime,
  formatPartnerPhone,
  partnerStatusBadgeClass,
} from "./format";

// 협력사 주문 목록 화면. 데이터 조회는 page.tsx 가 하고 여기는 그리기만 한다.
export default function PartnerOrderListView({
  partnerName,
  view,
  orders,
  counts,
  completed,
  basePath = "/partner/orders",
}: {
  partnerName: string;
  view: PartnerOrderView;
  orders: PartnerOrderSummary[];
  counts: Record<PartnerOrderView, number>;
  /** 완료 탭일 때만: 조회 기간과 합계 */
  completed?: { range: PartnerCompletedRange; summary: PartnerCompletedSummary; today: string };
  basePath?: string;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <PartnerHeader partnerName={partnerName} homeHref={basePath} />
      <main className="mx-auto max-w-7xl px-6 py-6">
        <nav className="mb-5 flex gap-1 border-b border-zinc-200">
          {(Object.keys(PARTNER_ORDER_VIEWS) as PartnerOrderView[]).map((key) => (
            <Link
              key={key}
              href={key === "active" ? basePath : `${basePath}?view=${key}`}
              className={[
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
                key === view
                  ? "border-zinc-950 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:text-zinc-900",
              ].join(" ")}
            >
              {PARTNER_ORDER_VIEWS[key].label}
              <span className="ml-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{counts[key]}</span>
            </Link>
          ))}
        </nav>

        {view === "completed" && completed ? (
          <PartnerCompletedSection
            basePath={basePath}
            range={completed.range}
            summary={completed.summary}
            today={completed.today}
          />
        ) : orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-16 text-center text-sm text-zinc-500">
            {PARTNER_ORDER_VIEWS[view].label} 건이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="whitespace-nowrap border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500">
                <tr>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">고객명</th>
                  <th className="px-4 py-3">연락처</th>
                  <th className="px-4 py-3">설치 주소</th>
                  <th className="px-4 py-3">설치 희망</th>
                  <th className="px-4 py-3">주문 상품</th>
                  <th className="px-4 py-3 text-right">청구 금액</th>
                  <th className="px-4 py-3">담당 기사</th>
                  <th className="px-4 py-3">배정 일시</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const href = `${basePath}/${order.id}`;
                  return (
                    <tr key={order.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                      <RowCell href={href}>
                        <span className={partnerStatusBadgeClass(order.partnerStatus)}>
                          {formatPartnerStatus(order.partnerStatus)}
                        </span>
                      </RowCell>
                      <RowCell href={href} className="whitespace-nowrap font-semibold text-zinc-950">
                        {order.customerName ?? "고객명 없음"}
                      </RowCell>
                      <RowCell href={href} className="whitespace-nowrap">{formatPartnerPhone(order.customerPhone)}</RowCell>
                      <RowCell href={href} className="max-w-[260px]">
                        <span className="line-clamp-2 break-keep">{order.address ?? "-"}</span>
                      </RowCell>
                      <RowCell href={href} className="whitespace-nowrap">
                        {formatInstallSchedule(order.installDate, order.installTimeSlot)}
                      </RowCell>
                      <RowCell href={href} className="max-w-[320px] text-zinc-600">
                        <span className="line-clamp-2 break-keep" title={order.memo ?? undefined}>
                          {order.memo ?? "-"}
                        </span>
                      </RowCell>
                      <RowCell
                        href={href}
                        className={[
                          "whitespace-nowrap text-right font-semibold",
                          order.claimAmount == null ? "text-amber-700" : "text-zinc-950",
                        ].join(" ")}
                      >
                        {formatClaimAmount(order.claimAmount)}
                      </RowCell>
                      <RowCell href={href} className="whitespace-nowrap">{order.installer ?? "-"}</RowCell>
                      <RowCell href={href} className="whitespace-nowrap text-zinc-500">
                        {formatPartnerDateTime(order.partnerAssignedAt)}
                      </RowCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
