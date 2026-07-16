import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createBackofficeAuthUser,
  deleteBackofficeAuthUser,
  resetBackofficeAuthUserPassword,
} from "./backofficeAuthAdmin";

const { createUserMock, updateUserByIdMock, deleteUserMock } = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
  deleteUserMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { admin: { createUser: createUserMock, updateUserById: updateUserByIdMock, deleteUser: deleteUserMock } },
  })),
}));

describe("backoffice Supabase Auth admin", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test/",
      SUPABASE_SECRET_KEY: "sb_secret_test",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
    };
  });

  afterEach(() => { process.env = originalEnv; });

  it("creates an email-confirmed user with an initial password", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "supabase-user-1" } }, error: null });

    await expect(createBackofficeAuthUser("user@example.com", "initial-password")).resolves.toEqual({
      supabaseUserId: "supabase-user-1",
    });
    expect(createClient).toHaveBeenCalledWith("https://supabase.example.test", "sb_secret_test", {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    expect(createUserMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "initial-password",
      email_confirm: true,
    });
  });

  it("resets and deletes a user through the admin API", async () => {
    updateUserByIdMock.mockResolvedValue({ data: { user: {} }, error: null });
    deleteUserMock.mockResolvedValue({ data: {}, error: null });

    await resetBackofficeAuthUserPassword("supabase-user-1", "new-password");
    await deleteBackofficeAuthUser("supabase-user-1");

    expect(updateUserByIdMock).toHaveBeenCalledWith("supabase-user-1", { password: "new-password" });
    expect(deleteUserMock).toHaveBeenCalledWith("supabase-user-1");
  });

  it("treats an already deleted Auth user as a successful delete", async () => {
    deleteUserMock.mockResolvedValue({
      data: {},
      error: { code: "user_not_found", message: "User not found" },
    });

    await expect(deleteBackofficeAuthUser("supabase-user-1")).resolves.toBeUndefined();
  });

  it("fails closed when the server secret is missing", async () => {
    process.env = { ...process.env, SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" };

    await expect(createBackofficeAuthUser("user@example.com", "password")).rejects.toThrow(
      "SUPABASE_AUTH_ADMIN_CONFIG_MISSING",
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});
