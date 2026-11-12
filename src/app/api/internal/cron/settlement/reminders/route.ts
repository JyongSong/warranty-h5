import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { acquireCronJobRunLock, releaseCronJobRunLock } from "@/lib/cron/control";
import {
  recordCronJobCalled,
  recordCronJobFinished,
  recordCronJobSkipped,
  SETTLEMENT_REMINDERS_CRON_JOB,
} from "@/lib/cron/status";
import { sendCertExpiryReminders, sendInvoiceDeadlineReminders } from "@/lib/installation/settlement/reminders";
import { syncNtsResults } from "@/lib/installation/settlement/popbill-admin";

// 시각은 vercel.json 의 스케줄(00:00 UTC = 09:00 KST, 매일)이 정한다.
// 정산 기능이 공개 전이면 각 알림이 알아서 아무것도 하지 않는다.
// 앱 발행 세금계산서의 국세청 전송 결과도 여기서 팝빌에 물어 채운다(팝빌은 발행 다음 날 15시에 전송).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = SETTLEMENT_REMINDERS_CRON_JOB;
const LOCK_KEY = "settlement.reminders";
const LOCK_TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  await recordCronJobCalled(JOB);

  let startedAt: Date | null = null;
  try {
    // 재시도나 수동 호출이 겹쳐 같은 알림이 두 번 가지 않게 잠근다.
    const lockToken = await acquireCronJobRunLock(LOCK_KEY, LOCK_TTL_MS);
    if (!lockToken) {
      await recordCronJobSkipped(JOB, "LOCKED", "JOB_LOCKED");
      return NextResponse.json({ ok: true, skipped: true, reason: "JOB_LOCKED" });
    }
    try {
      startedAt = new Date();
      const invoice = await sendInvoiceDeadlineReminders(startedAt);
      const cert = await sendCertExpiryReminders(startedAt);
      const nts = await syncNtsResults(startedAt).catch((error) => {
        console.error("[cron/settlement-reminders/nts]", error);
        return null;
      });
      const failed = (invoice?.failed ?? 0) + (cert?.failed ?? 0);
      console.info("[cron/settlement-reminders]", { invoice, cert, nts });
      await recordCronJobFinished(JOB, failed > 0 ? "DEGRADED" : "SUCCESS", startedAt, failed > 0 ? "PUSH_PARTIAL_FAILURE" : null);
      return NextResponse.json({ ok: true, invoice, cert, nts });
    } finally {
      await releaseCronJobRunLock(LOCK_KEY, lockToken);
    }
  } catch (error) {
    console.error("[cron/settlement-reminders]", error);
    await recordCronJobFinished(JOB, "FAILED", startedAt ?? new Date(), "SETTLEMENT_REMINDERS_FAILED");
    return NextResponse.json({ ok: false, error: "SETTLEMENT_REMINDERS_FAILED" }, { status: 500 });
  }
}
