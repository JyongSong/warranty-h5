import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePartnerWithCode } from "@/lib/partnerAuth";
import { getInstallationPartnerByCode } from "@/lib/installation/partner/service";
import { formatPartnerStatus } from "@/lib/installation/partner/routing";
import { getPartnerOrderDetail } from "@/lib/installation/partner/views";
import PartnerHeader from "../PartnerHeader";
import PartnerNoteTimeline from "../PartnerNoteTimeline";
import PartnerOrderActions from "./PartnerOrderActions";
import { formatInstallSchedule, formatPartnerDateTime, formatPartnerPhone } from "../format";

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

  const workable = order.status === "INSTALLER_ASSIGNED";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <PartnerHeader partnerName={partner.name} />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 py-5">
        <Link href="/partner/orders" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          ← 목록
        </Link>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold">{order.customerName ?? "고객명 없음"}</h1>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
              {formatPartnerStatus(order.partnerStatus)}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="whitespace-nowrap text-zinc-500">연락처</dt>
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
            <dt className="whitespace-nowrap text-zinc-500">설치 주소</dt>
            <dd className="break-keep">{order.address ?? "-"}</dd>
            <dt className="whitespace-nowrap text-zinc-500">설치 희망</dt>
            <dd>{formatInstallSchedule(order.installDate, order.installTimeSlot)}</dd>
            <dt className="whitespace-nowrap text-zinc-500">고객 요청</dt>
            <dd className="whitespace-pre-wrap break-keep">{order.customerNote ?? "-"}</dd>
            <dt className="whitespace-nowrap text-zinc-500">주문 상품</dt>
            <dd className="break-keep">{order.memo ?? "-"}</dd>
            <dt className="whitespace-nowrap text-zinc-500">주문번호</dt>
            <dd>{order.orderNumber ?? "-"}</dd>
            <dt className="whitespace-nowrap text-zinc-500">배정 일시</dt>
            <dd>{formatPartnerDateTime(order.partnerAssignedAt)}</dd>
          </dl>
        </section>

        {workable ? (
          <PartnerOrderActions orderId={order.id} partnerStatus={order.partnerStatus} />
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            {order.status === "WAITING_HQ_REVIEW"
              ? "설치 완료가 등록되어 본사 검수 중입니다."
              : order.status === "COMPLETED"
                ? "본사 검수가 끝난 완료 건입니다."
                : "더 이상 진행할 수 없는 건입니다."}
          </p>
        )}

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-base font-bold">진행 기록</h2>
          <PartnerNoteTimeline notes={order.notes} />
        </section>
      </main>
    </div>
  );
}
