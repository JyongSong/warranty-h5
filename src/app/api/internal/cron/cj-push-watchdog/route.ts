import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { CJ_ORDER_PUSH_WATCHDOG_JOB, recordCronJobCalled, recordCronJobFinished } from "@/lib/cron/status";
import { checkCjOrderPush } from "@/lib/installation/cj/cj-order-push-watchdog";

// 매시 45분: 회사 PC 의 CJ 주문번호 수신이 끊겼는지 보고, 끊겼으면 문자로 알린다.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  await recordCronJobCalled(CJ_ORDER_PUSH_WATCHDOG_JOB);
  const startedAt = new Date();
  try {
    const result = await checkCjOrderPush({ now: startedAt });
    if (result.state === "STALE" || (result.state === "OK" && result.sent)) console.info("[cron/cj-push-watchdog]", result);
    await recordCronJobFinished(CJ_ORDER_PUSH_WATCHDOG_JOB, "SUCCESS", startedAt, null);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/cj-push-watchdog]", error);
    await recordCronJobFinished(CJ_ORDER_PUSH_WATCHDOG_JOB, "FAILED", startedAt, "CJ_PUSH_WATCHDOG_FAILED");
    return NextResponse.json({ ok: false, error: "CJ_PUSH_WATCHDOG_FAILED" }, { status: 500 });
  }
}
