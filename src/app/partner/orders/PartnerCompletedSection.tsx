import Link from "next/link";
import type { PartnerCompletedRange, PartnerCompletedSummary } from "@/lib/installation/partner/views";
import { formatClaimAmount } from "./format";

// 협력사 완료 탭: 기사 앱의 이력/정산처럼 기간 합계와 건별 내역을 보여준다.
// 기사 앱은 월 단위지만 협력사는 관리자가 고른 기간(시작일~종료일)으로 본다.
// 완료일 = 본사 검수 승인일.

export default function PartnerCompletedSection({
  basePath,
  range,
  summary,
  today,
}: {
  basePath: string;
  range: PartnerCompletedRange;
  summary: PartnerCompletedSummary;
  today: string;
}) {
  const presets = buildPresets(today);

  return (
    <div className="grid gap-3">
      <form method="get" action={basePath} className="rounded-lg border border-zinc-200 bg-white p-4">
        <input type="hidden" name="view" value="completed" />
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-zinc-500">
            시작일
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              max={today}
              className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
            />
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-zinc-500">
            종료일
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              max={today}
              className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
            />
          </label>
          <button type="submit" className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
            조회
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = preset.from === range.from && preset.to === range.to;
            return (
              <Link
                key={preset.label}
                href={`${basePath}?view=completed&from=${preset.from}&to=${preset.to}`}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  active ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-700",
                ].join(" ")}
              >
                {preset.label}
              </Link>
            );
          })}
        </div>
      </form>

      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-5 text-center">
        <p className="text-xs font-semibold text-zinc-500">
          {formatYmd(range.from)} ~ {formatYmd(range.to)} 청구 합계
        </p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-950">
          {summary.totalAmount.toLocaleString("ko-KR")}원
        </p>
        <p className="mt-1 text-xs text-zinc-500">완료 {summary.orders.length}건 · 본사 검수 승인일 기준</p>
      </div>

      {summary.pendingReviewCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">
            본사 검수 중 {summary.pendingReviewCount}건 · {summary.pendingReviewAmount.toLocaleString("ko-KR")}원
          </p>
          <p className="mt-0.5 text-xs">본사 승인 후 완료로 넘어오며, 승인일 기준으로 합계에 들어갑니다.</p>
        </div>
      ) : null}

      <h2 className="mt-2 text-sm font-bold text-zinc-700">완료 내역</h2>
      {summary.orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          이 기간에 완료된 건이 없습니다.
        </p>
      ) : (
        <ul className="grid gap-2">
          {summary.orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`${basePath}/${order.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
              >
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">
                    {order.completedAt ? formatYmd(toKstYmdLocal(order.completedAt)) : "-"} 완료
                    {order.installer ? ` · 기사 ${order.installer}` : ""}
                  </p>
                  <p className="mt-0.5 font-semibold text-zinc-950">{order.customerName ?? "고객명 없음"}</p>
                  <p className="truncate text-sm text-zinc-600">{order.address ?? "-"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-extrabold text-zinc-950">{formatClaimAmount(order.claimAmount)}</p>
                  <p className="text-xs text-zinc-400">상세 ›</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildPresets(today: string) {
  const [year, month] = today.split("-").map(Number);
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const lastMonthStart = lastMonthDate.toISOString().slice(0, 10);
  const lastMonthEnd = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  const last30Start = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);

  return [
    { label: "이번 달", from: thisMonthStart, to: today },
    { label: "지난 달", from: lastMonthStart, to: lastMonthEnd },
    { label: "최근 30일", from: last30Start, to: today },
  ];
}

function toKstYmdLocal(date: Date) {
  return new Date(new Date(date).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 2026-10-28 → 2026.10.28 */
function formatYmd(ymd: string) {
  return ymd.replaceAll("-", ".");
}
