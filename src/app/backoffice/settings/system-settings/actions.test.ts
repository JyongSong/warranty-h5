import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { updateSystemSettingAction } from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/login/backofficeAuth", () => ({
  getCurrentBackofficeUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    backofficeSetting: {
      upsert: vi.fn(),
    },
  },
}));

const getCurrentBackofficeUserMock = vi.mocked(getCurrentBackofficeUser);
const upsertMock = vi.mocked(prisma.backofficeSetting.upsert);
const revalidatePathMock = vi.mocked(revalidatePath);

describe("updateSystemSettingAction", () => {
  beforeEach(() => {
    getCurrentBackofficeUserMock.mockReset();
    upsertMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("upserts a system setting value as the current admin", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("key", "installation.dispatcher.enabled");
    formData.set("value", "false");

    const result = await updateSystemSettingAction(formData);

    expect(result).toEqual({ ok: true, key: "installation.dispatcher.enabled" });
    expect(upsertMock).toHaveBeenCalledWith({
      where: { key: "installation.dispatcher.enabled" },
      create: {
        key: "installation.dispatcher.enabled",
        value: "false",
        updatedBy: "admin-1",
      },
      update: {
        value: "false",
        updatedBy: "admin-1",
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/backoffice/settings/system-settings");
  });

  it("rejects users without backoffice write access", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "viewer-1",
      supabaseUserId: "supabase-1",
      email: "viewer@example.com",
      level: 0,
    });

    const formData = new FormData();
    formData.set("key", "installation.dispatcher.enabled");
    formData.set("value", "true");

    await expect(updateSystemSettingAction(formData)).resolves.toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects keys outside the known system setting set", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("key", "custom.experimental.enabled");
    formData.set("value", "true");

    await expect(updateSystemSettingAction(formData)).resolves.toEqual({
      ok: false,
      error: "SETTING_KEY_NOT_EDITABLE",
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects invalid values before writing a system setting", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("key", "installation.sms.deliveryMode");
    formData.set("value", "live");

    await expect(updateSystemSettingAction(formData)).resolves.toEqual({
      ok: false,
      error: "SETTING_VALUE_INVALID",
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range numeric system settings before writing", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("key", "installation.dispatcher.limit.sendInstallationNotifications");
    formData.set("value", "999999");

    await expect(updateSystemSettingAction(formData)).resolves.toEqual({
      ok: false,
      error: "SETTING_VALUE_INVALID",
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("allows an administrator to update an assignment SMS safety limit", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("key", "backoffice.sms.assignment.maxRecipientsPerDay");
    formData.set("value", "2000");

    await expect(updateSystemSettingAction(formData)).resolves.toEqual({
      ok: true,
      key: "backoffice.sms.assignment.maxRecipientsPerDay",
    });
    expect(upsertMock).toHaveBeenCalledWith({
      where: { key: "backoffice.sms.assignment.maxRecipientsPerDay" },
      create: {
        key: "backoffice.sms.assignment.maxRecipientsPerDay",
        value: "2000",
        updatedBy: "admin-1",
      },
      update: {
        value: "2000",
        updatedBy: "admin-1",
      },
    });
  });
});
