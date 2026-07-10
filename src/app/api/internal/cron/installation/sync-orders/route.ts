import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { INSTALLATION_SYNC_ORDERS_ENABLED_KEY, isCronJobEnabled } from "@/lib/cron/control";
import {
  INSTALLATION_SYNC_ORDERS_CRON_JOB,
  recordCronJobCalled,
  recordCronJobFinished,
  recordCronJobSkipped,
} from "@/lib/cron/status";
import { syncInstallationOrdersFromErp } from "@/lib/installation/orders/source/sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  await recordCronJobCalled(INSTALLATION_SYNC_ORDERS_CRON_JOB);

  let startedAt: Date | null = null;
  try {
    if (!(await isCronJobEnabled(INSTALLATION_SYNC_ORDERS_ENABLED_KEY))) {
      await recordCronJobSkipped(
        INSTALLATION_SYNC_ORDERS_CRON_JOB,
        "DISABLED",
        "CRON_DISABLED",
      );

      return NextResponse.json({
        ok: true,
        job: "installation/sync-orders",
        skipped: true,
        reason: "CRON_DISABLED",
      });
    }

    startedAt = new Date();
    const result = await syncInstallationOrdersFromErp();
    await recordCronJobFinished(INSTALLATION_SYNC_ORDERS_CRON_JOB, "SUCCESS", startedAt, null);

    return NextResponse.json({
      ok: true,
      job: "installation/sync-orders",
      fetchedCount: result.fetchedCount,
      savedCount: result.savedCount,
    });
  } catch (error) {
    console.error("[cron/installation/sync-orders]", error);
    await recordCronJobFinished(
      INSTALLATION_SYNC_ORDERS_CRON_JOB,
      "FAILED",
      startedAt ?? new Date(),
      "ERP_DATA_SYNC_FAILED",
    );

    return NextResponse.json(
      {
        ok: false,
        job: "installation/sync-orders",
        error: "ERP_DATA_SYNC_FAILED",
      },
      { status: 500 },
    );
  }
}
