import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBackofficeDashboardChartSummary,
  getBackofficeSystemStatusSummary,
} from "./dashboard";

const {
  cronJobStatusFindMany,
  installationOrderCount,
  queryRawUnsafe,
  systemSettingFindMany,
} = vi.hoisted(() => ({
  cronJobStatusFindMany: vi.fn(),
  installationOrderCount: vi.fn(),
  queryRawUnsafe: vi.fn(),
  systemSettingFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
    cronJobStatus: {
      findMany: cronJobStatusFindMany,
    },
    installationOrder: {
      count: installationOrderCount,
    },
    backofficeSetting: {
      findMany: systemSettingFindMany,
    },
  },
}));

describe("getBackofficeDashboardChartSummary", () => {
  beforeEach(() => {
    installationOrderCount.mockReset();
  });

  it("loads dated trend data and current queue distribution for the backoffice root charts", async () => {
    installationOrderCount
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(6);

    await expect(
      getBackofficeDashboardChartSummary({
        days: 2,
        now: new Date("2026-06-25T03:00:00.000Z"),
      }),
    ).resolves.toEqual({
      window: {
        days: 2,
        from: "2026-06-24",
        to: "2026-06-25",
        label: "최근 2일",
      },
      dailyTrend: [
        {
          date: "2026-06-24",
          label: "6/24",
          createdOrders: 2,
          completedOrders: 1,
        },
        {
          date: "2026-06-25",
          label: "6/25",
          createdOrders: 3,
          completedOrders: 0,
        },
      ],
      queueStatusItems: [
        { key: "customerInputSmsRequired", label: "고객 문자 발송 필요", count: 11 },
        { key: "waitingCustomerInput", label: "고객 입력 대기", count: 4 },
        { key: "readyToAssign", label: "후보 선정 가능", count: 3 },
        { key: "waitingAdminReview", label: "관리자 검토 대기", count: 2 },
        { key: "waitingInstallerResponse", label: "기사 응답 대기", count: 1 },
      ],
      attentionCount: 6,
    });

    expect(installationOrderCount).toHaveBeenNthCalledWith(1, {
      where: {
        createdAt: {
          gte: new Date("2026-06-23T15:00:00.000Z"),
          lt: new Date("2026-06-24T15:00:00.000Z"),
        },
      },
    });
    expect(installationOrderCount).toHaveBeenNthCalledWith(2, {
      where: {
        status: "COMPLETED",
        statusChangedAt: {
          gte: new Date("2026-06-23T15:00:00.000Z"),
          lt: new Date("2026-06-24T15:00:00.000Z"),
        },
      },
    });
    expect(installationOrderCount).toHaveBeenNthCalledWith(5, {
      where: { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
    });
    expect(installationOrderCount).toHaveBeenNthCalledWith(9, {
      where: { status: "WAITING_INSTALLER_RESPONSE" },
    });
    expect(installationOrderCount).toHaveBeenNthCalledWith(10, {
      where: {
        OR: [
          { hasOpenIssue: true },
          { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
          { status: "WAITING_ADMIN_REVIEW" },
        ],
      },
    });
  });
});

describe("getBackofficeSystemStatusSummary", () => {
  beforeEach(() => {
    cronJobStatusFindMany.mockReset();
    queryRawUnsafe.mockReset();
    systemSettingFindMany.mockReset();
  });

  it("loads cron status for the system status page without run history lookup", async () => {
    cronJobStatusFindMany.mockResolvedValueOnce([
      {
        key: "installation.dispatcher",
        path: "/api/internal/cron/installation/dispatcher",
        schedule: "*/5 * * * *",
        lastCalledAt: new Date("2026-06-18T05:35:00.000Z"),
        lastStartedAt: new Date("2026-06-18T05:35:01.000Z"),
        lastFinishedAt: new Date("2026-06-18T05:35:03.000Z"),
        lastStatus: "SUCCESS",
        lastDurationMs: 2000,
        lastErrorCode: null,
        updatedAt: new Date("2026-06-18T05:35:03.000Z"),
      },
    ]);
    systemSettingFindMany.mockResolvedValueOnce([
      { key: "installation.syncOrders.enabled", value: "false" },
      { key: "installation.dispatcher.enabled", value: "true" },
    ]);

    await expect(
      getBackofficeSystemStatusSummary({
        now: new Date("2026-06-18T05:36:00.000Z"),
      }),
    ).resolves.toEqual({
      cronJobs: [
        {
          key: "installation.syncOrders",
          label: "설치 주문 동기화",
          path: "/api/internal/cron/installation/sync-orders",
          schedule: "*/30 * * * *",
          enabled: false,
          effectiveMode: null,
          lastCalledAt: null,
          lastStartedAt: null,
          lastFinishedAt: null,
          lastStatus: null,
          lastDurationMs: null,
          lastErrorCode: null,
          health: {
            status: "disabled",
            label: "비활성",
            tone: "muted",
          },
        },
        {
          key: "installation.dispatcher",
          label: "설치 Dispatcher",
          path: "/api/internal/cron/installation/dispatcher",
          schedule: "*/5 * * * *",
          enabled: true,
          effectiveMode: "manual",
          lastCalledAt: new Date("2026-06-18T05:35:00.000Z"),
          lastStartedAt: new Date("2026-06-18T05:35:01.000Z"),
          lastFinishedAt: new Date("2026-06-18T05:35:03.000Z"),
          lastStatus: "SUCCESS",
          lastDurationMs: 2000,
          lastErrorCode: null,
          health: {
            status: "healthy",
            label: "정상",
            tone: "success",
          },
        },
      ],
    });

    expect(queryRawUnsafe).not.toHaveBeenCalled();
    expect(cronJobStatusFindMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: ["installation.syncOrders", "installation.dispatcher"],
        },
      },
    });
    expect(systemSettingFindMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: [
            "installation.syncOrders.enabled",
            "installation.dispatcher.enabled",
            "installation.sms.customerInputRequestMode",
          ],
        },
      },
      select: {
        key: true,
        value: true,
      },
    });
  });

  it("derives cron health from freshness, effective config, and last result", async () => {
    cronJobStatusFindMany.mockResolvedValueOnce([
      {
        key: "installation.syncOrders",
        path: "/api/internal/cron/installation/sync-orders",
        schedule: "*/30 * * * *",
        lastCalledAt: new Date("2026-06-25T00:00:00.000Z"),
        lastStartedAt: new Date("2026-06-25T00:00:10.000Z"),
        lastFinishedAt: null,
        lastStatus: "SUCCESS",
        lastDurationMs: null,
        lastErrorCode: null,
        updatedAt: new Date("2026-06-25T00:00:10.000Z"),
      },
      {
        key: "installation.dispatcher",
        path: "/api/internal/cron/installation/dispatcher",
        schedule: "*/5 * * * *",
        lastCalledAt: new Date("2026-06-24T23:40:00.000Z"),
        lastStartedAt: new Date("2026-06-24T23:40:05.000Z"),
        lastFinishedAt: new Date("2026-06-24T23:40:20.000Z"),
        lastStatus: "LOCKED",
        lastDurationMs: null,
        lastErrorCode: "JOB_LOCKED",
        updatedAt: new Date("2026-06-24T23:40:20.000Z"),
      },
    ]);
    systemSettingFindMany.mockResolvedValueOnce([
      { key: "installation.syncOrders.enabled", value: "true" },
      { key: "installation.dispatcher.enabled", value: "true" },
      { key: "installation.sms.customerInputRequestMode", value: "manual" },
      { key: "installation.dispatcher.lockTtlMs", value: "240000" },
    ]);

    await expect(
      getBackofficeSystemStatusSummary({
        now: new Date("2026-06-25T00:06:00.000Z"),
      }),
    ).resolves.toMatchObject({
      cronJobs: [
        {
          key: "installation.syncOrders",
          enabled: true,
          effectiveMode: null,
          health: {
            status: "running",
            label: "실행 중",
            tone: "warning",
          },
        },
        {
          key: "installation.dispatcher",
          enabled: true,
          effectiveMode: "manual",
          health: {
            status: "stale",
            label: "호출 지연",
            tone: "danger",
          },
        },
      ],
    });
  });
});
