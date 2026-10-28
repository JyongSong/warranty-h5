import Link from "next/link";
import { formatPartnerStatus } from "@/lib/installation/partner/routing";
import type { PartnerOrderDetail } from "@/lib/installation/partner/views";
import PartnerHeader from "../PartnerHeader";
import PartnerNoteTimeline from "../PartnerNoteTimeline";
import PartnerOrderActions from "./PartnerOrderActions";
import {
  formatClaimAmount,
  formatInstallSchedule,
  formatPartnerDateTime,
  formatPartnerPhone,
  partnerStatusBadgeClass,
} from "../format";

// 협력사 주문 상세 화면. 데이터 조회는 page.tsx 가 하고 여기는 그리기만 한다.
export default function PartnerOrderDetailView({
  partnerName,
  order,
  basePath = "/partner/orders",
}: {
  partnerName: string;
  order: PartnerOrderDetail;
  basePath?: string;
}) {
  const workable = order.status === "INSTALLER_ASSIGNED";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <PartnerHeader partnerName={partnerName} homeHref={basePath} />
      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={basePath} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
              ← 목록
            </Link>
            <h1 className="text-xl font-bold">{order.customerName ?? "고객명 없음"}</h1>
            <span className={partnerStatusBadgeClass(order.partnerStatus)}>{formatPartnerStatus(order.partnerStatus)}</span>
          </div>
          {order.orderNumber ? <span className="text-sm text-zinc-500">주문번호 {order.orderNumber}</span> : null}
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="grid gap-5">
            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="mb-4 text-base font-bold">주문 정보</h2>
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
                <dt className="text-zinc-500">연락처</dt>
                <dd>
                  {order.customerPhone ? (
                    <a href={`tel:${order.customerPhone}`} className="font-semibold text-blue-700">
                      {formatPartnerPhone(order.customerPhone)}
                    </a>
                  ) : (
                    "-"
                  )}
                  {order.backupPhone ? (
                    <span className="ml-2 text-zinc-500">(주문자 {formatPartnerPhone(order.backupPhone)})</span>
                  ) : null}
                </dd>
                <dt className="text-zinc-500">설치 주소</dt>
                <dd className="break-keep">{order.address ?? "-"}</dd>
                <dt className="text-zinc-500">설치 희망</dt>
                <dd>{formatInstallSchedule(order.installDate, order.installTimeSlot)}</dd>
                <dt className="text-zinc-500">고객 요청</dt>
                <dd className="whitespace-pre-wrap break-keep">{order.customerNote ?? "-"}</dd>
                <dt className="text-zinc-500">주문 상품</dt>
                <dd className="break-keep">{order.memo ?? "-"}</dd>
              </dl>
            </section>

            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Fact label="청구 금액" value={formatClaimAmount(order.claimAmount)} warn={order.claimAmount == null} />
              <Fact label="담당 기사" value={order.installer ?? "미입력"} warn={!order.installer} />
              <Fact label="접수 일시" value={order.acceptedAt ? formatPartnerDateTime(order.acceptedAt) : "접수 전"} warn={!order.acceptedAt} />
              <Fact
                label="완료 등록"
                value={order.completionSubmittedAt ? formatPartnerDateTime(order.completionSubmittedAt) : "-"}
              />
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="mb-3 text-base font-bold">진행 기록</h2>
              <PartnerNoteTimeline notes={order.notes} />
            </section>
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-20">
            {workable ? (
              <PartnerOrderActions orderId={order.id} claimAmount={order.claimAmount} installer={order.installer} />
            ) : (
              <p className="rounded-lg border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600">
                {order.status === "WAITING_HQ_REVIEW"
                  ? "설치 완료가 등록되어 본사 검수 중입니다."
                  : order.status === "COMPLETED"
                    ? "본사 검수가 끝난 완료 건입니다."
                    : "더 이상 진행할 수 없는 건입니다."}
              </p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={["mt-1 text-sm font-semibold", warn ? "text-amber-700" : "text-zinc-950"].join(" ")}>{value}</p>
    </div>
  );
}
