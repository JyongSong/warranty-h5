import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getInstallationDispatcherConfigRows,
  loadInstallationDispatcherConfig,
} from "./dispatcher-config";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    backofficeSetting: {
      findMany: vi.fn(),
    },
  },
}));

const systemSettingFindManyMock = vi.mocked(prisma.backofficeSetting.findMany);
const updatedAt = new Date("2026-06-23T00:00:00.000Z");

function setting(key: string, value: string) {
  return { key, value, createdAt: updatedAt, updatedAt, updatedBy: null };
}

describe("loadInstallationDispatcherConfig", () => {
  beforeEach(() => {
    systemSettingFindManyMock.mockReset();
  });

  it("loads dispatcher enabled, lock TTL, and limits with one system settings query", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      setting("installation.dispatcher.enabled", "true"),
      setting("installation.dispatcher.lockTtlMs", "180000"),
      setting("installation.dispatcher.limit.processInstallationOrders", "7"),
      setting("installation.dispatcher.limit.sendInstallationNotifications", "9"),
      setting("installation.sms.sendWindowStart", "09:30"),
      setting("installation.sms.sendWindowEnd", "19:45"),
    ]);

    const config = await loadInstallationDispatcherConfig();

    expect(systemSettingFindManyMock).toHaveBeenCalledOnce();
    expect(config.enabled).toBe(true);
    expect(config.customerInputRequestMode).toBe("manual");
    expect(config.lockTtlMs).toBe(180000);
    expect(config.limits.processInstallationOrders).toBe(7);
    expect(config.limits.sendInstallationNotifications).toBe(9);
    expect(config.smsSendWindow).toEqual({ start: "09:30", end: "19:45" });
  });

  it("loads manual customer input request mode from system settings", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      setting("installation.dispatcher.enabled", "true"),
      setting("installation.sms.customerInputRequestMode", "manual"),
    ]);

    const config = await loadInstallationDispatcherConfig();

    expect(config.customerInputRequestMode).toBe("manual");
    expect(systemSettingFindManyMock).toHaveBeenCalledWith({
      where: {
        key: {
          in: expect.arrayContaining(["installation.sms.customerInputRequestMode"]),
        },
      },
      select: {
        key: true,
        value: true,
      },
    });
  });

  it("loads explicit auto customer input request mode from system settings", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      setting("installation.dispatcher.enabled", "true"),
      setting("installation.sms.customerInputRequestMode", "auto"),
    ]);

    const config = await loadInstallationDispatcherConfig();

    expect(config.customerInputRequestMode).toBe("auto");
  });

  it("falls back to JSON defaults for missing or invalid numeric settings", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      setting("installation.dispatcher.enabled", "true"),
      setting("installation.dispatcher.lockTtlMs", "999999"),
      setting("installation.dispatcher.limit.processInstallationOrders", "0"),
      setting("installation.dispatcher.limit.sendInstallationNotifications", "abc"),
      setting("installation.sms.sendWindowStart", "8:00"),
      setting("installation.sms.sendWindowEnd", "24:00"),
    ]);

    const config = await loadInstallationDispatcherConfig();

    expect(config.lockTtlMs).toBe(240000);
    expect(config.limits.processInstallationOrders).toBe(25);
    expect(config.limits.sendInstallationNotifications).toBe(10);
    expect(config.smsSendWindow).toEqual({ start: "08:00", end: "20:00" });
  });
});

describe("getInstallationDispatcherConfigRows", () => {
  it("formats effective dispatcher config for the read-only admin settings page", () => {
    const rows = getInstallationDispatcherConfigRows({
      enabled: true,
      customerInputRequestMode: "manual",
      smsSendWindow: { start: "08:00", end: "20:00" },
      lockTtlMs: 180000,
      limits: {
        processInstallationOrders: 7,
        fallbackCustomerRequests: 25,
        dispatchReadyOrders: 25,
        timeoutInstallerAssignments: 25,
        alertDueSoonOrders: 50,
        sendInstallationNotifications: 9,
        syncSmsDeliveryReports: 11,
      },
    });

    expect(rows).toContainEqual({
      key: "installation.dispatcher.lockTtlMs",
      value: "180000",
      description: "설치 dispatcher 실행 lock 유지 시간(ms)",
    });
    expect(rows).toContainEqual({
      key: "installation.sms.customerInputRequestMode",
      value: "manual",
      description: "고객 입력 요청 문자 발송 방식(auto/manual)",
    });
    expect(rows).toContainEqual({
      key: "installation.sms.sendWindowStart",
      value: "08:00",
      description: "설치 자동 문자 발송 허용 시작 시각(Asia/Seoul)",
    });
    expect(rows).toContainEqual({
      key: "installation.sms.sendWindowEnd",
      value: "20:00",
      description: "설치 자동 문자 발송 허용 종료 시각(Asia/Seoul, 종료 시각 제외)",
    });
    expect(rows).toContainEqual({
      key: "installation.dispatcher.limit.sendInstallationNotifications",
      value: "9",
      description: "pending 설치 SMS 발송 최대 처리 건수",
    });
  });
});
