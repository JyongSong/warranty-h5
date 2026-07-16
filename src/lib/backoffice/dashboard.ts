import { prisma } from "@/lib/prisma";
import { INSTALLATION_CRON_JOBS } from "@/lib/cron/status";

type CronHealthStatus = "healthy" | "running" | "stale" | "failed" | "degraded" | "disabled" | "locked" | "notStarted";
type CronHealthTone = "success" | "warning" | "danger" | "muted";

const CHART_STATUS_ITEMS = [
  {
    key: "customerInputSmsRequired",
    label: "고객 문자 발송 필요",
    status: "CUSTOMER_INPUT_SMS_REQUIRED",
  },
  {
    key: "waitingCustomerInput",
    label: "고객 입력 대기",
    status: "WAITING_CUSTOMER_INPUT",
  },
  {
    key: "readyToAssign",
    label: "후보 선정 가능",
    status: "READY_FOR_CANDIDATE_SELECTION",
  },
  {
    key: "waitingAdminReview",
    label: "관리자 검토 대기",
    status: "WAITING_ADMIN_REVIEW",
  },
  {
    key: "waitingInstallerResponse",
    label: "기사 응답 대기",
    status: "WAITING_INSTALLER_RESPONSE",
  },
] as const;

export type BackofficeDashboardChartSummary = Awaited<ReturnType<typeof getBackofficeDashboardChartSummary>>;
export type BackofficeSystemStatusSummary = Awaited<ReturnType<typeof getBackofficeSystemStatusSummary>>;

export async function getBackofficeDashboardChartSummary({
  days = 14,
  now = new Date(),
}: {
  days?: number;
  now?: Date;
} = {}) {
  const normalizedDays = Math.max(1, Math.min(31, Math.floor(days)));
  const dayBuckets = buildKstDayBuckets(normalizedDays, now);
  const [dailyTrend, queueStatusItems, attentionCount] = await Promise.all([
    Promise.all(
      dayBuckets.map(async (bucket) => {
        const [createdOrders, completedOrders] = await Promise.all([
          prisma.installationOrder.count({
            where: {
              createdAt: {
                gte: bucket.start,
                lt: bucket.end,
              },
            },
          }),
          prisma.installationOrder.count({
            where: {
              status: "COMPLETED",
              statusChangedAt: {
                gte: bucket.start,
                lt: bucket.end,
              },
            },
          }),
        ]);

        return {
          date: bucket.date,
          label: bucket.label,
          createdOrders,
          completedOrders,
        };
      }),
    ),
    Promise.all(
      CHART_STATUS_ITEMS.map(async (item) => ({
        key: item.key,
        label: item.label,
        count: await prisma.installationOrder.count({
          where: { status: item.status },
        }),
      })),
    ),
    prisma.installationOrder.count({
      where: {
        OR: [
          { hasOpenIssue: true },
          { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
          { status: "WAITING_ADMIN_REVIEW" },
        ],
      },
    }),
  ]);

  return {
    window: {
      days: normalizedDays,
      from: dayBuckets[0]?.date ?? "",
      to: dayBuckets[dayBuckets.length - 1]?.date ?? "",
      label: `최근 ${normalizedDays}일`,
    },
    dailyTrend,
    queueStatusItems,
    attentionCount,
  };
}

export async function getBackofficeSystemStatusSummary({
  now = new Date(),
}: {
  now?: Date;
} = {}) {
  return {
    cronJobs: await listInstallationCronJobSummaries(now),
  };
}

async function listInstallationCronJobSummaries(now: Date) {
  const cronJobKeys = INSTALLATION_CRON_JOBS.map((job) => job.key);
  const cronSettingKeys = new Set(INSTALLATION_CRON_JOBS.map((job) => job.enabledSettingKey));
  cronSettingKeys.add("installation.sms.customerInputRequestMode");

  const [statuses, settings] = await Promise.all([
    prisma.cronJobStatus.findMany({
      where: {
        key: {
          in: cronJobKeys,
        },
      },
    }),
    prisma.backofficeSetting.findMany({
      where: {
        key: {
          in: [...cronSettingKeys],
        },
      },
      select: {
        key: true,
        value: true,
      },
    }),
  ]);
  const statusByKey = new Map(statuses.map((status) => [status.key, status]));
  const settingByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return INSTALLATION_CRON_JOBS.map((job) => {
    const status = statusByKey.get(job.key);
    const enabled = settingByKey.get(job.enabledSettingKey) === "true";
    const effectiveMode =
      job.key === "installation.dispatcher"
        ? readCustomerInputRequestMode(settingByKey.get("installation.sms.customerInputRequestMode"))
        : null;

    return {
      key: job.key,
      label: job.label,
      path: job.path,
      schedule: job.schedule,
      enabled,
      effectiveMode,
      lastCalledAt: status?.lastCalledAt ?? null,
      lastStartedAt: status?.lastStartedAt ?? null,
      lastFinishedAt: status?.lastFinishedAt ?? null,
      lastStatus: status?.lastStatus ?? null,
      lastDurationMs: status?.lastDurationMs ?? null,
      lastErrorCode: status?.lastErrorCode ?? null,
      health: deriveCronHealth({
        enabled,
        now,
        schedule: job.schedule,
        lastCalledAt: status?.lastCalledAt ?? null,
        lastStartedAt: status?.lastStartedAt ?? null,
        lastFinishedAt: status?.lastFinishedAt ?? null,
        lastStatus: status?.lastStatus ?? null,
      }),
    };
  });
}

function deriveCronHealth({
  enabled,
  now,
  schedule,
  lastCalledAt,
  lastStartedAt,
  lastFinishedAt,
  lastStatus,
}: {
  enabled: boolean;
  now: Date;
  schedule: string;
  lastCalledAt: Date | null;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastStatus: string | null;
}): {
  status: CronHealthStatus;
  label: string;
  tone: CronHealthTone;
} {
  if (!enabled) return { status: "disabled", label: "비활성", tone: "muted" };
  if (!lastCalledAt) return { status: "notStarted", label: "호출 기록 없음", tone: "warning" };
  if (isCronStatusStale(schedule, lastCalledAt, now)) {
    return { status: "stale", label: "호출 지연", tone: "danger" };
  }
  if (lastStatus === "FAILED") return { status: "failed", label: "실패", tone: "danger" };
  if (lastStatus === "DEGRADED") return { status: "degraded", label: "일부 실패", tone: "warning" };
  if (lastStartedAt && (!lastFinishedAt || lastStartedAt > lastFinishedAt)) {
    return { status: "running", label: "실행 중", tone: "warning" };
  }
  if (lastStatus === "LOCKED") return { status: "locked", label: "중복 실행 skip", tone: "warning" };
  if (lastStatus === "DISABLED") return { status: "disabled", label: "비활성", tone: "muted" };
  return { status: "healthy", label: "정상", tone: "success" };
}

function isCronStatusStale(schedule: string, lastCalledAt: Date, now: Date) {
  const intervalMs = getCronIntervalMs(schedule);
  if (!intervalMs) return false;

  const graceMs = Math.max(intervalMs * 2, 10 * 60 * 1000);
  return now.getTime() - lastCalledAt.getTime() > graceMs;
}

function getCronIntervalMs(schedule: string) {
  const match = schedule.match(/^\*\/(\d+) \* \* \* \*$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  return minutes * 60 * 1000;
}

function readCustomerInputRequestMode(value: string | undefined) {
  if (value === "auto") return "auto";
  if (value === "manual") return "manual";
  return "manual";
}

function buildKstDayBuckets(days: number, now: Date) {
  const todayKstDate = getKstDateString(now);
  const todayStartUtc = new Date(`${todayKstDate}T00:00:00+09:00`);

  return Array.from({ length: days }, (_, index) => {
    const date = addUtcDays(todayStartUtc, index - days + 1);
    const nextDate = addUtcDays(date, 1);
    const dateString = getKstDateString(date);

    return {
      date: dateString,
      label: formatChartDateLabel(dateString),
      start: date,
      end: nextDate,
    };
  });
}

function formatChartDateLabel(dateString: string) {
  const [, month, day] = dateString.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function getKstDateString(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(value);
}

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}
