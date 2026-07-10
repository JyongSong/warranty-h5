import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getSystemSettingDescription,
  listSystemSettings,
} from "./system-settings";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

const systemSettingQueryRawMock = vi.mocked(prisma.$queryRaw);

describe("listSystemSettings", () => {
  beforeEach(() => {
    systemSettingQueryRawMock.mockReset();
  });

  it("loads only known system settings with effective values for missing rows", async () => {
    systemSettingQueryRawMock.mockResolvedValue([
      {
        key: "installation.dispatcher.enabled",
        value: "true",
      },
      {
        key: "custom.experimental.enabled",
        value: "true",
      },
    ]);

    const settings = await listSystemSettings();
    const query = systemSettingQueryRawMock.mock.calls[0]?.[0] as readonly string[] | undefined;

    expect(systemSettingQueryRawMock).toHaveBeenCalledOnce();
    expect(query?.join("")).toContain('from "backoffice_settings"');
    expect(query?.join("")).toContain('"value"::text');
    expect(query?.join("")).not.toContain('"updated_at"');
    expect(query?.join("")).not.toContain('"updated_by"');
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
        key: "installation.dispatcher.limit.sendInstallationNotifications",
        value: "",
        effectiveValue: "10",
        valueStatus: "missing",
      }),
    );
    expect(settings).not.toContainEqual(expect.objectContaining({ key: "custom.experimental.enabled" }));
  });

  it("uses a fallback description for unknown system setting keys", () => {
    expect(getSystemSettingDescription("custom.experimental.enabled")).toBe("-");
  });
});
