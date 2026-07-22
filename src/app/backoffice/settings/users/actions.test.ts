import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  createBackofficeAuthUser,
  deleteBackofficeAuthUser,
  resetBackofficeAuthUserPassword,
} from "@/lib/login/backofficeAuthAdmin";
import {
  createBackofficeUserAction,
  deleteBackofficeUserAction,
  resetBackofficeUserPasswordAction,
  updateBackofficeUserAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/login/backofficeAuth", () => ({ getCurrentBackofficeUser: vi.fn() }));
vi.mock("@/lib/login/backofficeAuthAdmin", () => ({
  createBackofficeAuthUser: vi.fn(),
  deleteBackofficeAuthUser: vi.fn(),
  resetBackofficeAuthUserPassword: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { backofficeUser: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));

const admin = { id: "admin-1", supabaseUserId: "supabase-admin", email: "admin@example.com", level: 1 };
const getAdminMock = vi.mocked(getCurrentBackofficeUser);
const createAuthMock = vi.mocked(createBackofficeAuthUser);
const deleteAuthMock = vi.mocked(deleteBackofficeAuthUser);
const resetAuthPasswordMock = vi.mocked(resetBackofficeAuthUserPassword);
const createMock = vi.mocked(prisma.backofficeUser.create);
const findUniqueMock = vi.mocked(prisma.backofficeUser.findUnique);
const updateMock = vi.mocked(prisma.backofficeUser.update);
const deleteMock = vi.mocked(prisma.backofficeUser.delete);

function createForm() {
  const form = new FormData();
  form.set("email", "New.User@Example.COM");
  form.set("level", "1");
  form.set("password", "initial-password");
  form.set("confirmPassword", "initial-password");
  return form;
}

describe("backoffice user management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PII_ENCRYPTION_KEY = "current-pii-key";
    process.env.PII_HASH_KEY = "current-pii-hash-key";
    getAdminMock.mockResolvedValue(admin);
    deleteAuthMock.mockResolvedValue(undefined);
  });

  it("creates the Supabase account and app user together", async () => {
    createAuthMock.mockResolvedValue({ supabaseUserId: "supabase-user-1" });
    createMock.mockResolvedValue({ id: "user-1" } as never);

    await expect(createBackofficeUserAction(createForm())).resolves.toEqual({ ok: true, id: "user-1" });
    expect(createAuthMock).toHaveBeenCalledWith("new.user@example.com", "initial-password");
    expect(createMock).toHaveBeenCalledWith({
      data: {
        supabaseUserId: "supabase-user-1",
        emailEncrypted: expect.stringMatching(/^enc:v1:/),
        emailHash: expect.any(String),
        level: 1,
      },
      select: { id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/settings/users");
  });

  it("rejects mismatched passwords before creating an Auth user", async () => {
    const form = createForm();
    form.set("confirmPassword", "different-password");

    await expect(createBackofficeUserAction(form)).resolves.toEqual({
      ok: false,
      error: "PASSWORD_CONFIRMATION_MISMATCH",
    });
    expect(createAuthMock).not.toHaveBeenCalled();
  });

  it("deletes the Auth user as compensation when app DB creation fails", async () => {
    createAuthMock.mockResolvedValue({ supabaseUserId: "supabase-user-1" });
    createMock.mockRejectedValue(new Error("duplicate"));
    deleteAuthMock.mockResolvedValue(undefined);

    await expect(createBackofficeUserAction(createForm())).resolves.toEqual({
      ok: false,
      error: "USER_CREATE_FAILED",
    });
    expect(deleteAuthMock).toHaveBeenCalledWith("supabase-user-1");
  });

  it("updates a user's level", async () => {
    updateMock.mockResolvedValue({ id: "user-1" } as never);
    const form = new FormData();
    form.set("id", "user-1");
    form.set("level", "0");

    await expect(updateBackofficeUserAction(form)).resolves.toEqual({ ok: true, id: "user-1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { level: 0 },
      select: { id: true },
    });
  });

  it("resets a connected user's password", async () => {
    findUniqueMock.mockResolvedValue({ id: "user-1", supabaseUserId: "supabase-user-1" } as never);
    resetAuthPasswordMock.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("id", "user-1");
    form.set("newPassword", "new-password");
    form.set("confirmPassword", "new-password");

    await expect(resetBackofficeUserPasswordAction(form)).resolves.toEqual({ ok: true, id: "user-1" });
    expect(resetAuthPasswordMock).toHaveBeenCalledWith("supabase-user-1", "new-password");
  });

  it("blocks app access before deleting the Auth account and app row", async () => {
    findUniqueMock.mockResolvedValue({ id: "user-1", supabaseUserId: "supabase-user-1" } as never);
    updateMock.mockResolvedValue({ id: "user-1" } as never);
    deleteAuthMock.mockResolvedValue(undefined);
    deleteMock.mockResolvedValue({ id: "user-1" } as never);
    const form = new FormData();
    form.set("id", "user-1");

    await expect(deleteBackofficeUserAction(form)).resolves.toEqual({ ok: true, id: "user-1" });
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { level: 0 } });
    expect(deleteAuthMock).toHaveBeenCalledWith("supabase-user-1");
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("does not allow the current administrator to delete itself", async () => {
    const form = new FormData();
    form.set("id", "admin-1");

    await expect(deleteBackofficeUserAction(form)).resolves.toEqual({
      ok: false,
      error: "SELF_DELETE_NOT_ALLOWED",
    });
  });

  it("rejects writes from level-zero users", async () => {
    getAdminMock.mockResolvedValue({ ...admin, level: 0 });

    await expect(createBackofficeUserAction(createForm())).resolves.toEqual({ ok: false, error: "FORBIDDEN" });
    expect(createAuthMock).not.toHaveBeenCalled();
  });
});
