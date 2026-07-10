import {
  getBackofficeDashboardChartSummary,
  type BackofficeDashboardChartSummary,
} from "@/lib/backoffice/dashboard";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "./BackofficePageHeader";

type DailyTrendItem = BackofficeDashboardChartSummary["dailyTrend"][number];
type QueueStatusItem = BackofficeDashboardChartSummary["queueStatusItems"][number];

export default async function BackofficePage() {
  await requireBackofficeUserPage("/backoffice", 1);
  const chartSummary = await getBackofficeDashboardChartSummary({ days: 14 });

  return (
    <div className="px-6 py-7 lg:px-8">
      <div className="max-w-6xl">
        <BackofficePageHeader
          title="운영 현황"
          meta={`${chartSummary.window.label} (${chartSummary.window.from} - ${chartSummary.window.to})`}
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
          <ChartPanel
            title="신규 주문과 설치 완료 추이"
            subtitle={`${chartSummary.window.label} 일별 집계. 신규 주문은 생성일, 설치 완료는 완료 상태 변경일 기준입니다.`}
          >
            <DailyOrdersChart data={chartSummary.dailyTrend} />
          </ChartPanel>

          <ChartPanel
            title="현재 대기 상태 분포"
            subtitle="기간 집계가 아니라 지금 남아 있는 상태별 주문 수입니다."
          >
            <QueueStatusChart data={chartSummary.queueStatusItems} />
          </ChartPanel>
        </section>
      </div>
    </div>
  );
}

function ChartPanel({
  children,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DailyOrdersChart({ data }: { data: DailyTrendItem[] }) {
  const maxValue = Math.max(1, ...data.map((item) => Math.max(item.createdOrders, item.completedOrders)));
  const chartWidth = 720;
  const chartHeight = 260;
  const padding = { top: 18, right: 18, bottom: 40, left: 34 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const bandWidth = plotWidth / Math.max(1, data.length);
  const barWidth = Math.max(8, Math.min(18, bandWidth * 0.28));
  const completedPoints = data.map((item, index) => {
    const x = padding.left + bandWidth * index + bandWidth / 2;
    const y = padding.top + plotHeight - (item.completedOrders / maxValue) * plotHeight;
    return { x, y };
  });
  const linePath = completedPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const yTicks = buildTicks(maxValue);

  return (
    <div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="최근 14일 신규 주문과 설치 완료 추이">
        {yTicks.map((tick) => {
          const y = padding.top + plotHeight - (tick / maxValue) * plotHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="#e4e4e7" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">
                {tick}
              </text>
            </g>
          );
        })}
        <line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={chartWidth - padding.right}
          y2={padding.top + plotHeight}
          stroke="#a1a1aa"
        />
        {data.map((item, index) => {
          const x = padding.left + bandWidth * index + bandWidth / 2 - barWidth / 2;
          const height = (item.createdOrders / maxValue) * plotHeight;
          const y = padding.top + plotHeight - height;

          return (
            <g key={item.date}>
              <rect x={x} y={y} width={barWidth} height={height} rx={3} fill="#2563eb" />
              {item.createdOrders > 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(12, y - 6)}
                  textAnchor="middle"
                  className="fill-zinc-700 text-[11px]"
                >
                  {item.createdOrders}
                </text>
              ) : null}
              {index === 0 || index === data.length - 1 || index % 3 === 1 ? (
                <text
                  x={padding.left + bandWidth * index + bandWidth / 2}
                  y={chartHeight - 14}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[11px]"
                >
                  {item.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
        {completedPoints.map((point, index) => (
          <circle
            key={data[index]?.date}
            cx={point.x}
            cy={point.y}
            r={3.5}
            fill="#f59e0b"
            stroke="#fff"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium text-zinc-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-blue-600" />
          신규 주문
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded bg-amber-500" />
          설치 완료
        </span>
      </div>
    </div>
  );
}

function QueueStatusChart({ data }: { data: QueueStatusItem[] }) {
  const maxValue = Math.max(1, ...data.map((item) => item.count));

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const width = `${Math.max(2, (item.count / maxValue) * 100)}%`;

        return (
          <div key={item.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-zinc-800">{item.label}</span>
              <span className="font-semibold tabular-nums text-zinc-950">{formatCount(item.count)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-slate-700" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildTicks(maxValue: number) {
  const upper = Math.max(1, maxValue);
  const middle = Math.ceil(upper / 2);
  return Array.from(new Set([0, middle, upper]));
}

function formatCount(value: number) {
  return `${value.toLocaleString("ko-KR")}건`;
}
