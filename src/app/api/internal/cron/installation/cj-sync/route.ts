import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  CJ_API_SYNC_CRON_JOB,
  recordCronJobCalled,
  recordCronJobFinished,
  recordCronJobSkipped,
} from "@/lib/cron/status";
import { CjApiError, readCjApiConfig } from "@/lib/installation/cj/cj-api";
import { syncCjManifestFromApi } from "@/lib/installation/cj/cj-api-sync";

export const dynamic = "force-dynamic";

const JOB = "installation/cj-sync";

// CJ API 에서 출고된 주문번호를 가져와 CJ 주문번호 명단에 넣는다.
// CJ_API_VENDOR_CODE / CJ_API_AUTH_KEY 가 없으면 아무것도 하지 않는다.
// 수동 확인용: ?dryRun=1 (DB 에 쓰지 않고 조회 건수만), ?days=N (1~30, 기본 7).
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const daysParam = Number(url.searchParams.get("days"));
  const lookbackDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;

  const config = readCjApiConfig();
  if (!dryRun) await recordCronJobCalled(CJ_API_SYNC_CRON_JOB);

  if (!config) {
    if (!dryRun) await recordCronJobSkipped(CJ_API_SYNC_CRON_JOB, "DISABLED", "CJ_API_NOT_CONFIGURED");
    return NextResponse.json({ ok: true, job: JOB, skipped: true, reason: "CJ_API_NOT_CONFIGURED" });
  }

  const startedAt = new Date();
  try {
    const result = await syncCjManifestFromApi(config, { lookbackDays, dryRun });
    if (!dryRun) await recordCronJobFinished(CJ_API_SYNC_CRON_JOB, "SUCCESS", startedAt, null);

    return NextResponse.json({ ok: true, job: JOB, dryRun, proxied: Boolean(config.proxyUrl), ...result });
  } catch (error) {
    const code = error instanceof CjApiError ? error.code : "CJ_API_SYNC_FAILED";
    console.error("[cron/installation/cj-sync]", error);
    if (!dryRun) await recordCronJobFinished(CJ_API_SYNC_CRON_JOB, "FAILED", startedAt, code);

    return NextResponse.json(
      {
        ok: false,
        job: JOB,
        error: code,
        // 키·프록시 비밀번호는 메시지에 들어가지 않는다(URL 과 CJ 응답 메시지만).
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
