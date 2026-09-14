import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  acquireCronJobRunLock,
  isCronJobEnabled,
  releaseCronJobRunLock,
  SURVEY_AUTO_SEND_ENABLED_KEY,
  SURVEY_AUTO_SEND_LOCK_KEY,
} from "@/lib/cron/control";
import {
  recordCronJobCalled,
  recordCronJobFinished,
  recordCronJobSkipped,
  SATISFACTION_SURVEY_SEND_CRON_JOB,
} from "@/lib/cron/status";
import { isKstBusinessDay } from "@/lib/survey/business-days";
import { sendDueSatisfactionSurveys } from "@/lib/survey/send";

// 시각은 vercel.json 의 스케줄(06:00 UTC = 15:00 KST, 월~금)이 정한다.
// 공휴일은 Vercel cron 이 알 수 없으므로 여기서 걸러 낸다.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_NAME = "survey/send-surveys";
const LOCK_TTL_MS = 10 * 60 * 1000;
const SEND_LIMIT_PER_RUN = 200;

export async function GET(request: Request) {
  return handleCronRequest(request);
}

export async function POST(request: Request) {
  return handleCronRequest(request);
}

async function handleCronRequest(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  await recordCronJobCalled(SATISFACTION_SURVEY_SEND_CRON_JOB);

  let startedAt: Date | null = null;
  try {
    if (!(await isCronJobEnabled(SURVEY_AUTO_SEND_ENABLED_KEY))) {
      await recordCronJobSkipped(SATISFACTION_SURVEY_SEND_CRON_JOB, "DISABLED", "CRON_DISABLED");

      return NextResponse.json({ ok: true, job: JOB_NAME, skipped: true, reason: "CRON_DISABLED" });
    }

    const now = new Date();
    if (!isKstBusinessDay(now)) {
      await recordCronJobSkipped(SATISFACTION_SURVEY_SEND_CRON_JOB, "DISABLED", "NOT_BUSINESS_DAY");

      return NextResponse.json({
        ok: true,
        job: JOB_NAME,
        skipped: true,
        reason: "NOT_BUSINESS_DAY",
      });
    }

    // 재시도나 수동 호출이 겹쳐 같은 사람에게 두 번 가지 않게 잠근다.
    const lockToken = await acquireCronJobRunLock(SURVEY_AUTO_SEND_LOCK_KEY, LOCK_TTL_MS);
    if (!lockToken) {
      await recordCronJobSkipped(SATISFACTION_SURVEY_SEND_CRON_JOB, "LOCKED", "JOB_LOCKED");

      return NextResponse.json({ ok: true, job: JOB_NAME, skipped: true, reason: "JOB_LOCKED" });
    }

    try {
      startedAt = new Date();
      const result = await sendDueSatisfactionSurveys({ now, limit: SEND_LIMIT_PER_RUN });

      console.info("[cron/send-surveys]", result);

      const degraded = result.failed > 0;
      await recordCronJobFinished(
        SATISFACTION_SURVEY_SEND_CRON_JOB,
        degraded ? "DEGRADED" : "SUCCESS",
        startedAt,
        degraded ? "SURVEY_SEND_PARTIAL_FAILURE" : null,
      );

      return NextResponse.json({ ok: true, job: JOB_NAME, ...result });
    } finally {
      await releaseCronJobRunLock(SURVEY_AUTO_SEND_LOCK_KEY, lockToken);
    }
  } catch (error) {
    console.error("[cron/send-surveys]", error);
    await recordCronJobFinished(
      SATISFACTION_SURVEY_SEND_CRON_JOB,
      "FAILED",
      startedAt ?? new Date(),
      "SURVEY_SEND_FAILED",
    );

    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: "SURVEY_SEND_FAILED" },
      { status: 500 },
    );
  }
}
