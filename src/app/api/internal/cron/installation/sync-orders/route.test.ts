import { beforeEach, describe, expect, it, vi } from "vitest";
import vercelConfig from "../../../../../../../vercel.json";
import { GET } from "@/app/api/internal/cron/installation/sync-orders/route";
import { syncInstallationOrdersFromErp } from "@/lib/installation/orders/source/sync";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJobStatus: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
    backofficeSetting: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/installation/orders/source/sync", () => ({
  syncInstallationOrdersFromErp: vi.fn(),
}));

const syncInstallationOrdersFromErpMock = vi.mocked(syncInstallationOrdersFromErp);
const cronJobStatusUpdateMock = vi.mocked(prisma.cronJobStatus.update);
const cronJobStatusUpsertMock = vi.mocked(prisma.cronJobStatus.upsert);
const systemSettingFindUniqueMock = vi.mocked(prisma.backofficeSetting.findUnique);

describe("GET /api/internal/cron/installation/sync-orders", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    systemSettingFindUniqueMock.mockReset();
    systemSettingFindUniqueMock.mockResolvedValue({
      key: "installation.syncOrders.enabled",
      value: "true",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedBy: null,
    });
    cronJobStatusUpdateMock.mockReset();
    cronJobStatusUpdateMock.mockResolvedValue({
      key: "installation.syncOrders",
      path: "/api/internal/cron/installation/sync-orders",
      schedule: "*/30 * * * *",
      lastCalledAt: new Date("2026-01-01T00:00:00.000Z"),
      lastStartedAt: null,
      lastFinishedAt: null,
      lastStatus: null,
      lastDurationMs: null,
      lastErrorCode: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    cronJobStatusUpsertMock.mockReset();
    cronJobStatusUpsertMock.mockResolvedValue({
      key: "installation.syncOrders",
      path: "/api/internal/cron/installation/sync-orders",
      schedule: "*/30 * * * *",
      lastCalledAt: new Date("2026-01-01T00:00:00.000Z"),
      lastStartedAt: null,
      lastFinishedAt: null,
      lastStatus: null,
      lastDurationMs: null,
      lastErrorCode: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    syncInstallationOrdersFromErpMock.mockReset();
  });

  it("registers the sync job in Vercel cron config", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/internal/cron/installation/sync-orders",
      schedule: "*/30 * * * *",
    });
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/internal/cron/installation/sync-orders"));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(syncInstallationOrdersFromErpMock).not.toHaveBeenCalled();
    expect(cronJobStatusUpsertMock).not.toHaveBeenCalled();
  });

  it("skips ERP installation order sync when the system setting disables the job", async () => {
    systemSettingFindUniqueMock.mockResolvedValue({
      key: "installation.syncOrders.enabled",
      value: "false",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedBy: "admin",
    });

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/sync-orders", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(syncInstallationOrdersFromErpMock).not.toHaveBeenCalled();
    expect(cronJobStatusUpsertMock).toHaveBeenCalledWith({
      where: { key: "installation.syncOrders" },
      create: {
        key: "installation.syncOrders",
        path: "/api/internal/cron/installation/sync-orders",
        schedule: "*/30 * * * *",
        lastCalledAt: expect.any(Date),
      },
      update: {
        path: "/api/internal/cron/installation/sync-orders",
        schedule: "*/30 * * * *",
        lastCalledAt: expect.any(Date),
      },
    });
    expect(cronJobStatusUpdateMock).toHaveBeenCalledWith({
      where: { key: "installation.syncOrders" },
      data: {
        lastFinishedAt: expect.any(Date),
        lastStatus: "DISABLED",
        lastDurationMs: null,
        lastErrorCode: "CRON_DISABLED",
      },
    });
    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/sync-orders",
      skipped: true,
      reason: "CRON_DISABLED",
    });
  });

  it("skips ERP installation order sync when the required system setting is missing", async () => {
    systemSettingFindUniqueMock.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/sync-orders", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(syncInstallationOrdersFromErpMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/sync-orders",
      skipped: true,
      reason: "CRON_DISABLED",
    });
  });

  it("syncs ERP installation orders when the cron bearer token is valid", async () => {
    syncInstallationOrdersFromErpMock.mockResolvedValue({
      fetchedCount: 2,
      savedCount: 1,
    });

    const response = await GET(
      new Request("http://localhost/api/internal/cron/installation/sync-orders", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      job: "installation/sync-orders",
      fetchedCount: 2,
      savedCount: 1,
    });
    expect(cronJobStatusUpdateMock).toHaveBeenLastCalledWith({
      where: { key: "installation.syncOrders" },
      data: {
        lastStartedAt: expect.any(Date),
        lastFinishedAt: expect.any(Date),
        lastStatus: "SUCCESS",
        lastDurationMs: expect.any(Number),
        lastErrorCode: null,
      },
    });
  });
});
