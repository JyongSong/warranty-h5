import Link from "next/link";
import type { ReactNode } from "react";
import type { PartnerCompletedRange, PartnerCompletedSummary } from "@/lib/installation/partner/views";
import { formatClaimAmount } from "./format";
import PartnerInstallItems from "./PartnerInstallItems";
import RowCell from "./PartnerRowCell";

// 협력사 완료 탭: 기사 앱의 이력/정산처럼 기간 합계와 건별 내역을 보여준다.
// 기사 앱은 월 단위지만 협력사는 관리자가 고른 기간(시작일~종료일)으로 본다.
// 완료일 = 협력사가 설치 완료 등록을 누른 날. 합계에는 본사 검수가 끝난 건만 넣는다.

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
    <div className="grid gap-4">
      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
      >
        <input type="hidden" name="view" value="completed" />
        <label className="grid gap-1 text-xs font-medium text-zinc-500">
          시작일
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            max={today}
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
          />
        </label>
        <span className="pb-2 text-zinc-400">~</span>
        <label className="grid gap-1 text-xs font-medium text-zinc-500">
          종료일
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            max={today}
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
          />
        </label>
        <button type="submit" className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
          조회
        </button>
        <div className="ml-2 flex flex-wrap gap-2 pb-1">
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

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={`${formatYmd(range.from)} ~ ${formatYmd(range.to)} 청구 합계`}>
          <p className="text-3xl font-extrabold tracking-tight text-zinc-950">
            {summary.totalAmount.toLocaleString("ko-KR")}원
          </p>
        </SummaryCard>
        <SummaryCard label="완료 건수">
          <p className="text-3xl font-extrabold tracking-tight text-zinc-950">{summary.orders.length}건</p>
          <p className="mt-1 text-xs text-zinc-500">설치 완료 등록일 기준 · 본사 검수 완료 건</p>
        </SummaryCard>
        <SummaryCard label="본사 검수 중 (합계 미포함)" tone={summary.pendingReviewCount > 0 ? "amber" : "default"}>
          <p className="text-3xl font-extrabold tracking-tight">
            {summary.pendingReviewCount}건
            <span className="ml-2 text-base font-bold">{summary.pendingReviewAmount.toLocaleString("ko-KR")}원</span>
          </p>
          <p className="mt-1 text-xs">본사 승인 후 합계에 들어갑니다.</p>
        </SummaryCard>
      </div>

      {summary.orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-16 text-center text-sm text-zinc-500">
          이 기간에 완료된 건이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="whitespace-nowrap border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th className="px-4 py-3">완료일</th>
                <th className="px-4 py-3">고객명</th>
                <th className="px-4 py-3">설치 주소</th>
                <th className="px-4 py-3">설치 품목</th>
                <th className="px-4 py-3">담당 기사</th>
                <th className="px-4 py-3 text-right">청구 금액</th>
              </tr>
            </thead>
            <tbody>
              {summary.orders.map((order) => {
                const href = `${basePath}/${order.id}`;
                return (
                  <tr key={order.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <RowCell href={href} className="whitespace-nowrap">
                      {order.completedAt ? formatYmd(toKstYmdLocal(order.completedAt)) : "-"}
                    </RowCell>
                    <RowCell href={href} className="whitespace-nowrap font-semibold text-zinc-950">
                      {order.customerName ?? "고객명 없음"}
                    </RowCell>
                    <RowCell href={href} className="max-w-[280px]">
                      <span className="line-clamp-2 break-keep">{order.address ?? "-"}</span>
                    </RowCell>
                    <RowCell href={href} className="max-w-[320px]">
                      <PartnerInstallItems items={order.installItems} compact />
                    </RowCell>
                    <RowCell href={href} className="whitespace-nowrap">{order.installer ?? "-"}</RowCell>
                    <RowCell href={href} className="whitespace-nowrap text-right font-bold text-zinc-950">
                      {formatClaimAmount(order.claimAmount)}
                    </RowCell>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-zinc-200 bg-zinc-50 text-sm font-bold">
              <tr>
                <td className="px-4 py-3" colSpan={5}>
                  합계 ({summary.orders.length}건)
                </td>
                <td className="px-4 py-3 text-right">{summary.totalAmount.toLocaleString("ko-KR")}원</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "amber";
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-lg border px-5 py-4",
        tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700",
      ].join(" ")}
    >
      <p className="mb-1 text-xs font-semibold opacity-80">{label}</p>
      {children}
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
