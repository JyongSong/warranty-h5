import { prisma } from "@/lib/prisma";

export type CronJobLastStatus = "SUCCESS" | "DEGRADED" | "DISABLED" | "LOCKED" | "FAILED";

export type CronJobDefinition = {
  key: string;
  label: string;
  path: string;
  schedule: string;
  enabledSettingKey: string;
};

export const INSTALLATION_SYNC_ORDERS_CRON_JOB: CronJobDefinition = {
  key: "installation.syncOrders",
  label: "설치 주문 동기화",
  path: "/api/internal/cron/installation/sync-orders",
  schedule: "*/30 * * * *",
  enabledSettingKey: "installation.syncOrders.enabled",
};

export const INSTALLATION_DISPATCHER_CRON_JOB: CronJobDefinition = {
  key: "installation.dispatcher",
  label: "설치 Dispatcher",
  path: "/api/internal/cron/installation/dispatcher",
  schedule: "*/5 * * * *",
  enabledSettingKey: "installation.dispatcher.enabled",
};

export const INSTALLATION_CRON_JOBS = [
  INSTALLATION_SYNC_ORDERS_CRON_JOB,
  INSTALLATION_DISPATCHER_CRON_JOB,
] as const;

export async function recordCronJobCalled(job: CronJobDefinition, now = new Date()) {
  await writeCronJobStatus(() =>
    prisma.cronJobStatus.upsert({
      where: { key: job.key },
      create: {
        key: job.key,
        path: job.path,
        schedule: job.schedule,
        lastCalledAt: now,
      },
      update: {
        path: job.path,
        schedule: job.schedule,
        lastCalledAt: now,
      },
    }),
  );
}

export async function recordCronJobSkipped(
  job: CronJobDefinition,
  status: Extract<CronJobLastStatus, "DISABLED" | "LOCKED">,
  errorCode: string,
  now = new Date(),
) {
  await writeCronJobStatus(async () => {
    await prisma.cronJobStatus.update({
      where: { key: job.key },
      data: {
        lastFinishedAt: now,
        lastStatus: status,
        lastDurationMs: null,
        lastErrorCode: errorCode,
      },
    });
  });
}

export async function recordCronJobFinished(
  job: CronJobDefinition,
  status: Extract<CronJobLastStatus, "SUCCESS" | "DEGRADED" | "FAILED">,
  startedAt: Date,
  errorCode: string | null,
  finishedAt = new Date(),
) {
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  await writeCronJobStatus(async () => {
    await prisma.cronJobStatus.update({
      where: { key: job.key },
      data: {
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        lastStatus: status,
        lastDurationMs: durationMs,
        lastErrorCode: errorCode,
      },
    });
  });
}

async function writeCronJobStatus(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    console.error("[cron/status]", error);
  }
}
