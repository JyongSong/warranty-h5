import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import vercelConfig from "../../../../../../../vercel.json";
import { GET } from "@/app/api/internal/cron/installation/dispatcher/route";
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
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJobStatus: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
    backofficeSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    cronJobRunLock: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/installation/notifications/sms-link-base-url", () => ({
  getSmsLinkBaseUrl: vi.fn(),
}));

vi.mock("@/lib/installation/orders/processor", () => ({
  processPendingInstallationOrders: vi.fn(),
}));

vi.mock("@/lib/installation/customer/fallback", () => ({
  fallbackExpiredInstallationCustomerRequests: vi.fn(),
}));

vi.mock("@/lib/installation/customer/reminder", () => ({
  remindExpiredInstallationCustomerRequests: vi.fn(),
}));

vi.mock("@/lib/installation/installer/dispatch", () => ({
  dispatchReadyInstallationOrders: vi.fn(),
}));

vi.mock("@/lib/installation/installer/guards", () => ({
  alertOrphanedInstallationOrders: vi.fn(),
  alertDueSoonUnassignedOrders: vi.fn(),
  timeoutExpiredInstallerAssignments: vi.fn(),
}));

vi.mock("@/lib/installation/notifications/outbox", () => ({
  sendPendingInstallationNotifications: vi.fn(),
  syncInstallationSmsDeliveryReports: vi.fn(),
}));

const getSmsLinkBaseUrlMock = vi.mocked(getSmsLinkBaseUrl);
const processPendingInstallationOrdersMock = vi.mocked(processPendingInstallationOrders);
const remindExpiredInstallationCustomerRequestsMock = vi.mocked(remindExpiredInstallationCustomerRequests);
const fallbackExpiredInstallationCustomerRequestsMock = vi.mocked(fallbackExpiredInstallationCustomerRequests);
const dispatchReadyInstallationOrdersMock = vi.mocked(dispatchReadyInstallationOrders);
const timeoutExpiredInstallerAssignmentsMock = vi.mocked(timeoutExpiredInstallerAssignments);
const alertOrphanedInstallationOrdersMock = vi.mocked(alertOrphanedInstallationOrders);
const alertDueSoonUnassignedOrdersMock = vi.mocked(alertDueSoonUnassignedOrders);
const sendPendingInstallationNotificationsMock = vi.mocked(sendPendingInstallationNotifications);
const syncInstallationSmsDeliveryReportsMock = vi.mocked(syncInstallationSmsDeliveryReports);
const cronJobStatusUpdateMock = vi.mocked(prisma.cronJobStatus.update);
const cronJobStatusUpsertMock = vi.mocked(prisma.cronJobStatus.upsert);
const systemSettingFindManyMock = vi.mocked(prisma.backofficeSetting.findMany);
const cronJobRunLockUpdateManyMock = vi.mocked(prisma.cronJobRunLock.updateMany);
const cronJobRunLockCreateMock = vi.mocked(prisma.cronJobRunLock.create);
const systemSettingUpdatedAt = new Date("2026-01-01T00:00:00.000Z");

function systemSetting(key: string, value: string) {
  return { key, value, createdAt: systemSettingUpdatedAt, updatedAt: systemSettingUpdatedAt, updatedBy: null };
}

describe("GET /api/internal/cron/installation/dispatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T03:00:00.000Z")); // 12:00 KST
    process.env.CRON_SECRET = "test-cron-secret";
    vi.clearAllMocks();

    cronJobStatusUpdateMock.mockResolvedValue({
      key: "installation.dispatcher",
      path: "/api/internal/cron/installation/dispatcher",
      schedule: "*/5 * * * *",
      lastCalledAt: new Date("2026-01-01T00:00:00.000Z"),
      lastStartedAt: null,
      lastFinishedAt: null,
      lastStatus: null,
      lastDurationMs: null,
      lastErrorCode: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    cronJobStatusUpsertMock.mockResolvedValue({
      key: "installation.dispatcher",
      path: "/api/internal/cron/installation/dispatcher",
      schedule: "*/5 * * * *",
      lastCalledAt: new Date("2026-01-01T00:00:00.000Z"),
      lastStartedAt: null,
      lastFinishedAt: null,
      lastStatus: null,
      lastDurationMs: null,
      lastErrorCode: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    systemSettingFindManyMock.mockResolvedValue([
      systemSetting("installation.dispatcher.enabled", "true"),
      systemSetting("installation.sms.customerInputRequestMode", "auto"),
      systemSetting("installation.dispatcher.lockTtlMs", "180000"),
      systemSetting("installation.dispatcher.limit.processInstallationOrders", "7"),
      systemSetting("installation.dispatcher.limit.sendInstallationNotifications", "9"),
      systemSetting("installation.dispatcher.limit.syncSmsDeliveryReports", "11"),
    ]);
    cronJobRunLockUpdateManyMock.mockResolvedValue({ count: 1 });
    cronJobRunLockCreateMock.mockResolvedValue({
      key: "installation.dispatcher",
      lockedUntil: new Date("2026-01-01T00:01:00.000Z"),
      lockedBy: "test-lock-owner",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    getSmsLinkBaseUrlMock.mockReturnValue("https://example.test");
    processPendingInstallationOrdersMock.mockResolvedValue({
      processedCount: 3,
      skippedDuplicateCount: 0,
      failedCount: 0,
    });
    remindExpiredInstallationCustomerRequestsMock.mockResolvedValue({
      remindedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    fallbackExpiredInstallationCustomerRequestsMock.mockResolvedValue({
      fallbackCount: 1,
      manualRequiredCount: 0,
      skippedCount: 2,
    });
    dispatchReadyInstallationOrdersMock.mockResolvedValue({
      dispatchedCount: 4,
      skippedCount: 5,
      failedCount: 0,
    });
    timeoutExpiredInstallerAssignmentsMock.mockResolvedValue({ timedOutCount: 6, failedCount: 0 });
    alertOrphanedInstallationOrdersMock.mockResolvedValue({ issueCount: 0 });
    alertDueSoonUnassignedOrdersMock.mockResolvedValue({ issueCount: 7 });
    sendPendingInstallationNotificationsMock.mockResolvedValue({ sentCount: 8, failedCount: 0, pushedCount: 0 });
    syncInstallationSmsDeliveryReportsMock.mockResolvedValue({
      checkedCount: 9,
      updatedCount: 9,
      deliveryFailedCount: 1,
      failedCount: 0,
    });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("registers the dispatcher job in Vercel cron config", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/internal/cron/installation/dispatcher",
      schedule: "*/5 * * * *",
    });
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/internal/cron/installation/dispatcher"));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(processPendingInstallationOrdersMock).not.toHaveBeenCalled();
    expect(cronJobStatusUpsertMock).not.toHaveBeenCalled();
  });

  it("skips dispatcher jobs when the system setting disables the job", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      systemSetting("installation.dispatcher.enabled", "false"),
    ]);

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(processPendingInstallationOrdersMock).not.toHaveBeenCalled();
    expect(cronJobRunLockUpdateManyMock).not.toHaveBeenCalled();
    expect(cronJobStatusUpsertMock).toHaveBeenCalledWith({
      where: { key: "installation.dispatcher" },
      create: {
        key: "installation.dispatcher",
        path: "/api/internal/cron/installation/dispatcher",
        schedule: "*/5 * * * *",
        lastCalledAt: expect.any(Date),
      },
      update: {
        path: "/api/internal/cron/installation/dispatcher",
        schedule: "*/5 * * * *",
        lastCalledAt: expect.any(Date),
      },
    });
    expect(cronJobStatusUpdateMock).toHaveBeenCalledWith({
      where: { key: "installation.dispatcher" },
      data: {
        lastFinishedAt: expect.any(Date),
        lastStatus: "DISABLED",
        lastDurationMs: null,
        lastErrorCode: "CRON_DISABLED",
      },
    });
    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/dispatcher",
      skipped: true,
      reason: "CRON_DISABLED",
    });
  });

  it("skips dispatcher jobs when the required system setting is missing", async () => {
    systemSettingFindManyMock.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(processPendingInstallationOrdersMock).not.toHaveBeenCalled();
    expect(cronJobRunLockUpdateManyMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/dispatcher",
      skipped: true,
      reason: "CRON_DISABLED",
    });
  });

  it("skips dispatcher jobs when another run already holds the job lock", async () => {
    cronJobRunLockUpdateManyMock.mockResolvedValue({ count: 0 });
    cronJobRunLockCreateMock.mockRejectedValue({ code: "P2002" });

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(processPendingInstallationOrdersMock).not.toHaveBeenCalled();
    expect(cronJobStatusUpdateMock).toHaveBeenCalledWith({
      where: { key: "installation.dispatcher" },
      data: {
        lastFinishedAt: expect.any(Date),
        lastStatus: "LOCKED",
        lastDurationMs: null,
        lastErrorCode: "JOB_LOCKED",
      },
    });
    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/dispatcher",
      skipped: true,
      reason: "JOB_LOCKED",
    });
  });

  it("runs internal installation jobs in dispatcher order", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(processPendingInstallationOrdersMock).toHaveBeenCalledWith({
      baseUrl: "https://example.test",
      limit: 7,
    });
    expect(remindExpiredInstallationCustomerRequestsMock).toHaveBeenCalledWith({
      baseUrl: "https://example.test",
      limit: 25,
    });
    expect(remindExpiredInstallationCustomerRequestsMock.mock.invocationCallOrder[0]).toBeLessThan(
      fallbackExpiredInstallationCustomerRequestsMock.mock.invocationCallOrder[0],
    );
    expect(fallbackExpiredInstallationCustomerRequestsMock).toHaveBeenCalledWith({
      limit: 25,
    });
    expect(dispatchReadyInstallationOrdersMock).toHaveBeenCalledWith({
      baseUrl: "https://example.test",
      limit: 10,
    });
    expect(timeoutExpiredInstallerAssignmentsMock).toHaveBeenCalledWith({
      limit: 25,
    });
    expect(alertOrphanedInstallationOrdersMock).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(alertDueSoonUnassignedOrdersMock).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(sendPendingInstallationNotificationsMock).toHaveBeenCalledWith({
      limit: 9,
    });
    expect(sendPendingInstallationNotificationsMock.mock.invocationCallOrder[0]).toBeLessThan(
      alertOrphanedInstallationOrdersMock.mock.invocationCallOrder[0],
    );
    expect(syncInstallationSmsDeliveryReportsMock).toHaveBeenCalledWith({
      limit: 11,
    });
    const acquireLockArgs = cronJobRunLockUpdateManyMock.mock.calls[0][0] as {
      where: { lockedUntil: { lte: Date } };
      data: { lockedUntil: Date };
    };
    expect(
      acquireLockArgs.data.lockedUntil.getTime() - acquireLockArgs.where.lockedUntil.lte.getTime(),
    ).toBe(180000);
    expect(cronJobRunLockUpdateManyMock).toHaveBeenLastCalledWith({
      where: {
        key: "installation.dispatcher",
        lockedBy: expect.any(String),
      },
      data: {
        lockedBy: null,
        lockedUntil: expect.any(Date),
      },
    });

    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/dispatcher",
      results: {
        processInstallationOrders: {
          processedCount: 3,
          skippedDuplicateCount: 0,
          failedCount: 0,
        },
        remindCustomerRequests: { remindedCount: 1, skippedCount: 0, failedCount: 0 },
        fallbackCustomerRequests: { fallbackCount: 1, manualRequiredCount: 0, skippedCount: 2 },
        dispatchReadyOrders: { dispatchedCount: 4, skippedCount: 5, failedCount: 0 },
        timeoutInstallerAssignments: { timedOutCount: 6, failedCount: 0 },
        alertOrphanedOrders: { issueCount: 0 },
        alertDueSoonOrders: { issueCount: 7 },
        sendInstallationNotifications: { sentCount: 8, failedCount: 0 },
        syncSmsDeliveryReports: {
          checkedCount: 9,
          updatedCount: 9,
          deliveryFailedCount: 1,
          failedCount: 0,
        },
      },
      metrics: {
        processInstallationOrders: { durationMs: expect.any(Number) },
        remindCustomerRequests: { durationMs: expect.any(Number) },
        fallbackCustomerRequests: { durationMs: expect.any(Number) },
        dispatchReadyOrders: { durationMs: expect.any(Number) },
        timeoutInstallerAssignments: { durationMs: expect.any(Number) },
        alertOrphanedOrders: { durationMs: expect.any(Number) },
        alertDueSoonOrders: { durationMs: expect.any(Number) },
        sendInstallationNotifications: { durationMs: expect.any(Number) },
        syncSmsDeliveryReports: { durationMs: expect.any(Number) },
      },
      config: {
        lockTtlMs: 180000,
        customerInputRequestMode: "auto",
        smsSendWindow: { start: "08:00", end: "20:00" },
        smsSendWindowOpen: true,
        limits: {
          processInstallationOrders: 7,
          remindCustomerRequests: 25,
          fallbackCustomerRequests: 25,
          dispatchReadyOrders: 10,
          timeoutInstallerAssignments: 25,
          alertDueSoonOrders: 50,
          sendInstallationNotifications: 9,
          syncSmsDeliveryReports: 11,
        },
      },
    });
    expect(cronJobStatusUpdateMock).toHaveBeenLastCalledWith({
      where: { key: "installation.dispatcher" },
      data: {
        lastStartedAt: expect.any(Date),
        lastFinishedAt: expect.any(Date),
        lastStatus: "SUCCESS",
        lastDurationMs: expect.any(Number),
        lastErrorCode: null,
      },
    });
  });

  it("skips automatic customer input SMS creation in manual mode", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      systemSetting("installation.dispatcher.enabled", "true"),
      systemSetting("installation.sms.customerInputRequestMode", "manual"),
      systemSetting("installation.dispatcher.lockTtlMs", "180000"),
      systemSetting("installation.dispatcher.limit.sendInstallationNotifications", "9"),
    ]);

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(processPendingInstallationOrdersMock).not.toHaveBeenCalled();
    expect(remindExpiredInstallationCustomerRequestsMock).toHaveBeenCalled();
    expect(sendPendingInstallationNotificationsMock).toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: true,
      results: {
        processInstallationOrders: {
          processedCount: 0,
          skippedDuplicateCount: 0,
          failedCount: 0,
          skippedManualMode: true,
        },
      },
      config: {
        customerInputRequestMode: "manual",
      },
    });
  });

  it("keeps pending SMS unsent outside the configured Seoul window while other steps run", async () => {
    vi.setSystemTime(new Date("2026-01-01T11:00:00.000Z")); // 20:00 KST

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(sendPendingInstallationNotificationsMock).not.toHaveBeenCalled();
    expect(processPendingInstallationOrdersMock).toHaveBeenCalled();
    expect(remindExpiredInstallationCustomerRequestsMock).toHaveBeenCalled();
    expect(dispatchReadyInstallationOrdersMock).toHaveBeenCalled();
    expect(syncInstallationSmsDeliveryReportsMock).toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      results: {
        sendInstallationNotifications: {
          sentCount: 0,
          failedCount: 0,
          skippedQuietHours: true,
        },
      },
      config: {
        smsSendWindow: { start: "08:00", end: "20:00" },
        smsSendWindowOpen: false,
      },
    });
  });

  it("marks the cron degraded when an order-level automatic step fails", async () => {
    dispatchReadyInstallationOrdersMock.mockResolvedValue({
      dispatchedCount: 0,
      skippedCount: 1,
      failedCount: 1,
    });

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/dispatcher", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(cronJobStatusUpdateMock).toHaveBeenLastCalledWith({
      where: { key: "installation.dispatcher" },
      data: {
        lastStartedAt: expect.any(Date),
        lastFinishedAt: expect.any(Date),
        lastStatus: "DEGRADED",
        lastDurationMs: expect.any(Number),
        lastErrorCode: "INSTALLATION_DISPATCHER_PARTIAL_FAILURE",
      },
    });
  });
});
