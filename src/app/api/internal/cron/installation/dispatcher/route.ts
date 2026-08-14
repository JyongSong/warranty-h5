import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  acquireCronJobRunLock,
  INSTALLATION_DISPATCHER_LOCK_KEY,
  releaseCronJobRunLock,
} from "@/lib/cron/control";
import { loadInstallationDispatcherConfig } from "@/lib/installation/installer/dispatcher-config";
import {
  INSTALLATION_DISPATCHER_CRON_JOB,
  recordCronJobCalled,
  recordCronJobFinished,
  recordCronJobSkipped,
} from "@/lib/cron/status";
import { fallbackExpiredInstallationCustomerRequests } from "@/lib/installation/customer/fallback";
import { remindExpiredInstallationCustomerRequests } from "@/lib/installation/customer/reminder";
import { dispatchReadyInstallationOrders } from "@/lib/installation/installer/dispatch";
import {
  alertOrphanedInstallationOrders,
  alertDueSoonUnassignedOrders,
  timeoutExpiredInstallerAssignments,
} from "@/lib/installation/installer/guards";
import {
  sendPendingInstallationNotifications,
  syncInstallationSmsDeliveryReports,
} from "@/lib/installation/notifications/outbox";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import { processPendingInstallationOrders } from "@/lib/installation/orders/processor";
import { isInstallationSmsSendWindowOpen } from "@/lib/installation/notifications/sms-send-window";
import { remindUnrespondedAsAssignments } from "@/lib/installation/as/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  await recordCronJobCalled(INSTALLATION_DISPATCHER_CRON_JOB);

  let startedAt: Date | null = null;
  try {
    const config = await loadInstallationDispatcherConfig();
    if (!config.enabled) {
      await recordCronJobSkipped(
        INSTALLATION_DISPATCHER_CRON_JOB,
        "DISABLED",
        "CRON_DISABLED",
      );

      return NextResponse.json({
        ok: true,
        job: "installation/dispatcher",
        skipped: true,
        reason: "CRON_DISABLED",
      });
    }

    const lockToken = await acquireCronJobRunLock(
      INSTALLATION_DISPATCHER_LOCK_KEY,
      config.lockTtlMs,
    );
    if (!lockToken) {
      await recordCronJobSkipped(INSTALLATION_DISPATCHER_CRON_JOB, "LOCKED", "JOB_LOCKED");

      return NextResponse.json({
        ok: true,
        job: "installation/dispatcher",
        skipped: true,
        reason: "JOB_LOCKED",
      });
    }

    const baseUrl = getSmsLinkBaseUrl();
    try {
      startedAt = new Date();
      const smsSendWindowOpen = isInstallationSmsSendWindowOpen(
        startedAt,
        config.smsSendWindow,
      );
      const metrics: Record<string, { durationMs: number }> = {};
      const results = {
        processInstallationOrders:
          config.customerInputRequestMode === "manual"
            ? {
                processedCount: 0,
                skippedDuplicateCount: 0,
                failedCount: 0,
                skippedManualMode: true,
              }
            : await runDispatcherStep(
                "processInstallationOrders",
                metrics,
                () =>
                  processPendingInstallationOrders({
                    baseUrl,
                    limit: config.limits.processInstallationOrders,
                  }),
              ),
        remindCustomerRequests: await runDispatcherStep("remindCustomerRequests", metrics, () =>
          remindExpiredInstallationCustomerRequests({
            baseUrl,
            limit: config.limits.remindCustomerRequests,
          }),
        ),
        fallbackCustomerRequests: await runDispatcherStep("fallbackCustomerRequests", metrics, () =>
          fallbackExpiredInstallationCustomerRequests({
            limit: config.limits.fallbackCustomerRequests,
          }),
        ),
        dispatchReadyOrders: await runDispatcherStep("dispatchReadyOrders", metrics, () =>
          dispatchReadyInstallationOrders({
            baseUrl,
            limit: config.limits.dispatchReadyOrders,
          }),
        ),
        timeoutInstallerAssignments: await runDispatcherStep(
          "timeoutInstallerAssignments",
          metrics,
          () =>
            timeoutExpiredInstallerAssignments({
              limit: config.limits.timeoutInstallerAssignments,
            }),
        ),
        alertDueSoonOrders: await runDispatcherStep("alertDueSoonOrders", metrics, () =>
          alertDueSoonUnassignedOrders({
            limit: config.limits.alertDueSoonOrders,
          }),
        ),
        remindUnrespondedAsAssignments: await runDispatcherStep(
          "remindUnrespondedAsAssignments",
          metrics,
          () =>
            smsSendWindowOpen
              ? remindUnrespondedAsAssignments({ now: startedAt ?? undefined, limit: 50 })
              : Promise.resolve({ remindedCount: 0, skippedQuietHours: true }),
        ),
        sendInstallationNotifications: await runDispatcherStep(
          "sendInstallationNotifications",
          metrics,
          () =>
            smsSendWindowOpen
              ? sendPendingInstallationNotifications({
                  limit: config.limits.sendInstallationNotifications,
                })
              : Promise.resolve({
                  sentCount: 0,
                  failedCount: 0,
                  skippedQuietHours: true,
                }),
        ),
        alertOrphanedOrders: await runDispatcherStep("alertOrphanedOrders", metrics, () =>
          alertOrphanedInstallationOrders({
            limit: config.limits.alertDueSoonOrders,
          }),
        ),
        syncSmsDeliveryReports: await runDispatcherStep("syncSmsDeliveryReports", metrics, () =>
          syncInstallationSmsDeliveryReports({
            limit: config.limits.syncSmsDeliveryReports,
          }),
        ),
      };

      console.info("[cron/installation/dispatcher]", {
        results,
        metrics,
        config: {
          lockTtlMs: config.lockTtlMs,
          customerInputRequestMode: config.customerInputRequestMode,
          smsSendWindow: config.smsSendWindow,
          smsSendWindowOpen,
          limits: config.limits,
        },
      });
      const degraded =
        results.processInstallationOrders.failedCount > 0 ||
        results.remindCustomerRequests.failedCount > 0 ||
        results.dispatchReadyOrders.failedCount > 0 ||
        results.timeoutInstallerAssignments.failedCount > 0 ||
        results.sendInstallationNotifications.failedCount > 0 ||
        results.syncSmsDeliveryReports.failedCount > 0 ||
        results.alertOrphanedOrders.issueCount > 0;
      await recordCronJobFinished(
        INSTALLATION_DISPATCHER_CRON_JOB,
        degraded ? "DEGRADED" : "SUCCESS",
        startedAt,
        degraded ? "INSTALLATION_DISPATCHER_PARTIAL_FAILURE" : null,
      );

      return NextResponse.json({
        ok: true,
        job: "installation/dispatcher",
        results,
        metrics,
        config: {
          lockTtlMs: config.lockTtlMs,
          customerInputRequestMode: config.customerInputRequestMode,
          smsSendWindow: config.smsSendWindow,
          smsSendWindowOpen,
          limits: config.limits,
        },
      });
    } finally {
      await releaseCronJobRunLock(INSTALLATION_DISPATCHER_LOCK_KEY, lockToken);
    }
  } catch (error) {
    console.error("[cron/installation/dispatcher]", error);
    await recordCronJobFinished(
      INSTALLATION_DISPATCHER_CRON_JOB,
      "FAILED",
      startedAt ?? new Date(),
      "INTERNAL_DISPATCHER_FAILED",
    );

    return NextResponse.json(
      {
        ok: false,
        job: "installation/dispatcher",
        error: "INTERNAL_DISPATCHER_FAILED",
      },
      { status: 500 },
    );
  }
}

async function runDispatcherStep<T>(
  name: string,
  metrics: Record<string, { durationMs: number }>,
  step: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    return await step();
  } finally {
    metrics[name] = {
      durationMs: Date.now() - startedAt,
    };
  }
}
