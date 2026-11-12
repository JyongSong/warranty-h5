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

export const SATISFACTION_SURVEY_SEND_CRON_JOB: CronJobDefinition = {
  key: "survey.autoSend",
  label: "만족도 조사 자동 발송",
  path: "/api/internal/cron/send-surveys",
  // Vercel cron 은 UTC 로 돈다. 06:00 UTC = 15:00 KST, 월~금.
  schedule: "0 6 * * 1-5",
  enabledSettingKey: "survey.autoSend.enabled",
};

// CJ 온스타일 주문번호 명단 자동 수신. 회사 PC 가 매시 CJ API 를 조회해
// 밀어 넣는다(Vercel cron 아님). 마지막 수신 시각·결과를 보는 용도.
export const CJ_ORDER_PUSH_JOB: CronJobDefinition = {
  key: "cj.orderPush",
  label: "CJ 주문번호 자동 수신",
  path: "/api/internal/cj/order-push",
  schedule: "회사 PC 작업 스케줄러, 매시",
  enabledSettingKey: "cj.orderPush.enabled",
};

// 기사 정산 알림(8일 세금계산서 기한·공동인증서 만료). 매일 00:00 UTC = 09:00 KST.
// 별도 켜고 끄는 스위치 없이 정산 공개(installer.settlement.launched)를 따른다.
export const SETTLEMENT_REMINDERS_CRON_JOB: CronJobDefinition = {
  key: "settlement.reminders",
  label: "기사 정산 알림",
  path: "/api/internal/cron/settlement/reminders",
  schedule: "0 0 * * *",
  enabledSettingKey: "installer.settlement.launched",
};

export const INSTALLATION_CRON_JOBS = [
  INSTALLATION_SYNC_ORDERS_CRON_JOB,
  INSTALLATION_DISPATCHER_CRON_JOB,
  SATISFACTION_SURVEY_SEND_CRON_JOB,
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
