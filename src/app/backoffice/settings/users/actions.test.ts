import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  createBackofficeUserAction,
  deleteBackofficeUserAction,
  updateBackofficeUserAction,
} from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/login/backofficeAuth", () => ({
  getCurrentBackofficeUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    backofficeUser: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const getCurrentBackofficeUserMock = vi.mocked(getCurrentBackofficeUser);
const createMock = vi.mocked(prisma.backofficeUser.create);
const deleteMock = vi.mocked(prisma.backofficeUser.delete);
const findUniqueMock = vi.mocked(prisma.backofficeUser.findUnique);
const updateMock = vi.mocked(prisma.backofficeUser.update);
const revalidatePathMock = vi.mocked(revalidatePath);

describe("backoffice user management actions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PII_ENCRYPTION_KEY: "current-pii-key",
    };
    getCurrentBackofficeUserMock.mockReset();
    createMock.mockReset();
    deleteMock.mockReset();
    findUniqueMock.mockReset();
    updateMock.mockReset();
    revalidatePathMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates a pending user without a Supabase user id", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });
    createMock.mockResolvedValue({ id: "user-1" } as never);

    const formData = new FormData();
    formData.set("email", "New.User@Example.COM");
    formData.set("level", "1");

    await expect(createBackofficeUserAction(formData)).resolves.toEqual({
      ok: true,
      id: "user-1",
    });
    expect(createMock).toHaveBeenCalledWith({
      data: {
        emailEncrypted: expect.stringMatching(/^enc:v1:/),
        emailHash: expect.any(String),
        level: 1,
      },
      select: { id: true },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/backoffice/settings/users");
  });

  it("creates a pending user with a numeric level value", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });
    createMock.mockResolvedValue({ id: "user-1" } as never);

    const formData = new FormData();
    formData.set("email", "level10@example.com");
    formData.set("level", "10");

    await expect(createBackofficeUserAction(formData)).resolves.toEqual({
      ok: true,
      id: "user-1",
    });
    expect(createMock).toHaveBeenCalledWith({
      data: {
        emailEncrypted: expect.stringMatching(/^enc:v1:/),
        emailHash: expect.any(String),
        level: 10,
      },
      select: { id: true },
    });
  });

  it("rejects non-integer level values", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("level", "1.5");

    await expect(createBackofficeUserAction(formData)).resolves.toEqual({
      ok: false,
      error: "LEVEL_INVALID",
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("updates only a user's level without requiring or rewriting email fields", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });
    updateMock.mockResolvedValue({ id: "user-1" } as never);

    const formData = new FormData();
    formData.set("id", "user-1");
    formData.set("level", "0");

    await expect(updateBackofficeUserAction(formData)).resolves.toEqual({
      ok: true,
      id: "user-1",
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        level: 0,
      },
      select: { id: true },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/backoffice/settings/users");
  });

  it("rejects lowering the current admin user's own level", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("id", "admin-1");
    formData.set("email", "admin@example.com");
    formData.set("level", "0");

    await expect(updateBackofficeUserAction(formData)).resolves.toEqual({
      ok: false,
      error: "SELF_LEVEL_DOWN_NOT_ALLOWED",
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects deleting the current admin user", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });

    const formData = new FormData();
    formData.set("id", "admin-1");

    await expect(deleteBackofficeUserAction(formData)).resolves.toEqual({
      ok: false,
      error: "SELF_DELETE_NOT_ALLOWED",
    });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deletes another backoffice user by id", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-1",
      email: "admin@example.com",
      level: 1,
    });
    deleteMock.mockResolvedValue({ id: "user-1" } as never);

    const formData = new FormData();
    formData.set("id", "user-1");

    await expect(deleteBackofficeUserAction(formData)).resolves.toEqual({
      ok: true,
      id: "user-1",
    });
    expect(deleteMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/backoffice/settings/users");
  });

  it("rejects writes from non-admin backoffice users", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "viewer-1",
      supabaseUserId: "supabase-1",
      email: "viewer@example.com",
      level: 0,
    });

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("level", "1");

    await expect(createBackofficeUserAction(formData)).resolves.toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
    expect(createMock).not.toHaveBeenCalled();
  });
});
