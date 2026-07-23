import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getSystemSettingDescription,
  listSystemSettings,
  validateSystemSettingValue,
} from "./system-settings";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    backofficeSetting: {
      findMany: vi.fn(),
    },
  },
}));

const systemSettingFindManyMock = vi.mocked(prisma.backofficeSetting.findMany);

describe("listSystemSettings", () => {
  beforeEach(() => {
    systemSettingFindManyMock.mockReset();
  });

  it("loads only known system settings with effective values for missing rows", async () => {
    systemSettingFindManyMock.mockResolvedValue([
      {
        key: "installation.dispatcher.enabled",
        value: "true",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedBy: null,
      },
      {
        key: "custom.experimental.enabled",
        value: "true",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedBy: null,
      },
      {
        key: "backoffice.sms.assignment.audit.internal-id",
        value: "{}",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedBy: null,
      },
    ]);

    const settings = await listSystemSettings();
    expect(systemSettingFindManyMock).toHaveBeenCalledOnce();
    expect(systemSettingFindManyMock).toHaveBeenCalledWith({
      where: {
        key: {
          in: expect.arrayContaining([
            "backoffice.sms.assignment.maxFileBytes",
            "backoffice.sms.assignment.maxRecipientsPerRequest",
            "backoffice.sms.assignment.maxRecipientsPerDay",
            "installation.dispatcher.enabled",
          ]),
        },
      },
      select: { key: true, value: true },
      orderBy: { key: "asc" },
    });
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "backoffice.sms.assignment.maxFileBytes",
        value: "",
        effectiveValue: "2097152",
        valueStatus: "missing",
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "backoffice.sms.assignment.maxRecipientsPerRequest",
        value: "",
        effectiveValue: "500",
        valueStatus: "missing",
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "backoffice.sms.assignment.maxRecipientsPerDay",
        value: "",
        effectiveValue: "1000",
        valueStatus: "missing",
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "installation.dispatcher.enabled",
        description: "설치 dispatcher cron 실행 여부",
        value: "true",
        effectiveValue: "true",
        valueStatus: "stored",
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "installation.sms.sendWindowStart",
        value: "",
        effectiveValue: "08:00",
        valueStatus: "missing",
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "installation.sms.sendWindowEnd",
        value: "",
        effectiveValue: "20:00",
        valueStatus: "missing",
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        key: "installation.dispatcher.limit.sendInstallationNotifications",
        value: "",
        effectiveValue: "10",
        valueStatus: "missing",
      }),
    );
    expect(settings).not.toContainEqual(expect.objectContaining({ key: "custom.experimental.enabled" }));
    expect(settings).not.toContainEqual(
      expect.objectContaining({ key: "backoffice.sms.assignment.audit.internal-id" }),
    );
  });

  it("uses a fallback description for unknown system setting keys", () => {
    expect(getSystemSettingDescription("custom.experimental.enabled")).toBe("-");
  });

  it("accepts only zero-padded 24-hour SMS send window values", () => {
    expect(validateSystemSettingValue("installation.sms.sendWindowStart", "08:00")).toEqual({
      ok: true,
      value: "08:00",
    });
    expect(validateSystemSettingValue("installation.sms.sendWindowEnd", "20:00")).toEqual({
      ok: true,
      value: "20:00",
    });
    expect(validateSystemSettingValue("installation.sms.sendWindowStart", "8:00")).toEqual({
      ok: false,
    });
    expect(validateSystemSettingValue("installation.sms.sendWindowEnd", "24:00")).toEqual({
      ok: false,
    });
  });

  it("validates editable assignment SMS safety limits", () => {
    expect(
      validateSystemSettingValue("backoffice.sms.assignment.maxRecipientsPerRequest", "500"),
    ).toEqual({ ok: true, value: "500" });
    expect(
      validateSystemSettingValue("backoffice.sms.assignment.maxRecipientsPerRequest", "5001"),
    ).toEqual({ ok: false });
    expect(
      validateSystemSettingValue("backoffice.sms.assignment.maxRecipientsPerDay", "0"),
    ).toEqual({ ok: false });
  });
});
