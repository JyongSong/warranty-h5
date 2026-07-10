import { getBackofficeSystemStatusSummary } from "@/lib/backoffice/dashboard";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../../BackofficePageHeader";

export const dynamic = "force-dynamic";

type CronJob = Awaited<ReturnType<typeof getBackofficeSystemStatusSummary>>["cronJobs"][number];

export default async function SystemStatusPage() {
  await requireBackofficeUserPage("/backoffice/settings/system-status", 1);
  const summary = await getBackofficeSystemStatusSummary();

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="시스템 상태" />

      <section className="max-w-4xl" aria-label="Cron 호출 상태">
        <div className="mb-5 text-sm leading-6 text-zinc-600">
          자동 작업 실행 상태
        </div>

        <CronJobStatusTable jobs={summary.cronJobs} />
      </section>
    </div>
  );
}

function CronJobStatusTable({ jobs }: { jobs: CronJob[] }) {
  const rows = [
    {
      label: "상태",
      render: (job: CronJob) => <StatusValue tone={job.health.tone}>{job.health.label}</StatusValue>,
    },
    {
      label: "자동 실행",
      render: (job: CronJob) => (
        <StatusValue tone={job.enabled ? "success" : "muted"}>{job.enabled ? "켜짐" : "꺼짐"}</StatusValue>
      ),
    },
    {
      label: "처리 모드",
      render: (job: CronJob) => (
        <StatusValue tone={job.effectiveMode ? "default" : "muted"}>
          {formatEffectiveMode(job)}
        </StatusValue>
      ),
    },
    {
      label: "스케줄",
      render: (job: CronJob) => <StatusValue>{job.schedule}</StatusValue>,
    },
    {
      label: "마지막 호출",
      render: (job: CronJob) => <StatusValue>{formatDateTime(job.lastCalledAt)}</StatusValue>,
    },
    {
      label: "마지막 시작",
      render: (job: CronJob) => <StatusValue>{formatDateTime(job.lastStartedAt)}</StatusValue>,
    },
    {
      label: "마지막 종료",
      render: (job: CronJob) => <StatusValue>{formatDateTime(job.lastFinishedAt)}</StatusValue>,
    },
    {
      label: "마지막 결과",
      render: (job: CronJob) => (
        <StatusValue tone={job.lastStatus === "FAILED" ? "danger" : "default"}>
          {formatCronStatus(job.lastStatus)}
        </StatusValue>
      ),
    },
    {
      label: "마지막 소요 시간",
      render: (job: CronJob) => <StatusValue tone="muted">{formatDuration(job.lastDurationMs)}</StatusValue>,
    },
    {
      label: "마지막 오류",
      render: (job: CronJob) => (
        <StatusValue tone={job.lastStatus === "FAILED" && job.lastErrorCode ? "dangerCode" : "muted"}>
          {job.lastErrorCode ?? "-"}
        </StatusValue>
      ),
    },
  ];

  return (
    <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-max min-w-full border-collapse text-sm whitespace-nowrap">
        <caption className="sr-only">설치 cron 작업별 마지막 실행 상태</caption>
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50/70">
            <th scope="col" className="w-28 px-4 py-3 text-left text-xs font-semibold text-zinc-500 sm:w-36">
              항목
            </th>
            {jobs.map((job) => (
              <th key={job.key} scope="col" className="px-4 py-3 text-left align-top">
                <div className="font-semibold text-zinc-950">{job.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-zinc-100 last:border-b-0">
              <th scope="row" className="px-4 py-3 text-left align-top text-xs font-semibold text-zinc-500">
                {row.label}
              </th>
              {jobs.map((job) => (
                <td key={job.key} className="px-4 py-3 align-top">
                  {row.render(job)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusValue({
  children,
  tone = "default",
}: {
  children: string;
  tone?: "default" | "danger" | "dangerCode" | "muted" | "success" | "warning";
}) {
  const className =
    tone === "dangerCode"
      ? "text-xs font-semibold text-red-700 sm:text-sm"
      : tone === "danger"
        ? "font-medium text-red-600"
        : tone === "warning"
          ? "font-medium text-amber-700"
          : tone === "success"
            ? "font-medium text-emerald-700"
            : tone === "muted"
              ? "text-zinc-500"
              : "text-zinc-950";

  return <span className={className}>{children}</span>;
}

function formatDateTime(value: Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
}

function formatCronStatus(value: string | null) {
  const labels: Record<string, string> = {
    SUCCESS: "성공",
    DISABLED: "설정 비활성",
    LOCKED: "중복 실행 skip",
    FAILED: "실패",
  };

  if (!value) return "-";
  return labels[value] ?? value;
}

function formatEffectiveMode(job: CronJob) {
  if (job.effectiveMode === "auto") return "고객 입력 자동 생성";
  if (job.effectiveMode === "manual") return "고객 입력 수동 생성";
  return "-";
}

function formatDuration(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}초`;
}
