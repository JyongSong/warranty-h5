import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  changeBackofficePassword,
  getCurrentBackofficeUser,
  signInBackofficeWithPassword,
  type SupabaseCookieToSet,
} from "./backofficeAuth";

const { authGetUserMock, authSignInWithPasswordMock, authSignOutMock, authUpdateUserMock } = vi.hoisted(
  () => ({
    authGetUserMock: vi.fn(),
    authSignInWithPasswordMock: vi.fn(),
    authSignOutMock: vi.fn(),
    authUpdateUserMock: vi.fn(),
  }),
);

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: vi.fn(() => []) })) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: authGetUserMock,
      signInWithPassword: authSignInWithPasswordMock,
      signOut: authSignOutMock,
      updateUser: authUpdateUserMock,
    },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { backofficeUser: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() } },
}));

const findFirstMock = vi.mocked(prisma.backofficeUser.findFirst);
const findUniqueMock = vi.mocked(prisma.backofficeUser.findUnique);
const updateMock = vi.mocked(prisma.backofficeUser.update);
const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    PII_ENCRYPTION_KEY: "current-pii-key",
    PII_HASH_KEY: "current-pii-hash-key",
  };
});

afterEach(() => { process.env = originalEnv; });

describe("changeBackofficePassword", () => {
  it("reauthenticates with the current password before changing it", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "supabase-user-1", email: "User@Example.com" } },
      error: null,
    });
    authSignInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "supabase-user-1" }, session: { access_token: "new-access-token" } },
      error: null,
    });
    authUpdateUserMock.mockResolvedValue({ data: { user: {} }, error: null });

    const cookiesToSet: SupabaseCookieToSet[] = [];
    await changeBackofficePassword("current-password", "new-password", cookiesToSet);

    expect(authSignInWithPasswordMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "current-password",
    });
    expect(authUpdateUserMock).toHaveBeenCalledWith({
      password: "new-password",
    });
  });

  it("rejects an invalid current password with a stable code", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "supabase-user-1", email: "user@example.com" } },
      error: null,
    });
    authSignInWithPasswordMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", message: "Invalid credentials" },
    });

    await expect(changeBackofficePassword("wrong", "new-password", [])).rejects.toThrow(
      "CURRENT_PASSWORD_INVALID",
    );
    expect(authUpdateUserMock).not.toHaveBeenCalled();
  });

  it("rejects reauthentication when it returns another user", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "supabase-user-1", email: "user@example.com" } },
      error: null,
    });
    authSignInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "supabase-user-2" }, session: { access_token: "other-access-token" } },
      error: null,
    });

    await expect(
      changeBackofficePassword("current-password", "new-password", []),
    ).rejects.toThrow("UNAUTHORIZED");
    expect(authUpdateUserMock).not.toHaveBeenCalled();
  });
});

describe("getCurrentBackofficeUser", () => {
  it("returns the local user linked to the Supabase session", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "supabase-user-1", email: "user@example.com" } },
      error: null,
    });
    findUniqueMock.mockResolvedValue({
      id: "user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "user@example.com",
      level: 1,
    } as never);

    await expect(getCurrentBackofficeUser()).resolves.toEqual({
      id: "user-1",
      supabaseUserId: "supabase-user-1",
      email: "user@example.com",
      level: 1,
    });
  });
});

describe("signInBackofficeWithPassword", () => {
  it("shows invalid credentials in Korean", async () => {
    authSignInWithPasswordMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    await expect(signInBackofficeWithPassword("user@example.com", "wrong", [])).rejects.toThrow(
      "이메일 또는 비밀번호가 올바르지 않습니다.",
    );
  });

  it("links a legacy app row by email hash on first sign-in", async () => {
    authSignInWithPasswordMock.mockResolvedValue({
      data: {
        session: { access_token: "access-token" },
        user: { id: "supabase-user-1", email: "User@Example.COM" },
      },
      error: null,
    });
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue({
      id: "user-1",
      supabaseUserId: null,
      emailEncrypted: "user@example.com",
      level: 1,
    } as never);
    updateMock.mockResolvedValue({
      id: "user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "user@example.com",
      level: 1,
    } as never);

    await expect(signInBackofficeWithPassword("User@Example.COM", "password", [])).resolves.toEqual({
      id: "user-1",
      supabaseUserId: "supabase-user-1",
      email: "user@example.com",
      level: 1,
    });
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { supabaseUserId: null, emailHash: expect.any(String) },
      select: { id: true, supabaseUserId: true, emailEncrypted: true, level: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        supabaseUserId: "supabase-user-1",
        emailEncrypted: expect.stringMatching(/^enc:v1:/),
        emailHash: expect.any(String),
        lastLoginAt: expect.any(Date),
      },
      select: { id: true, supabaseUserId: true, emailEncrypted: true, level: true },
    });
  });

  it("signs out an Auth user that has no app permission row", async () => {
    authSignInWithPasswordMock.mockResolvedValue({
      data: {
        session: { access_token: "access-token" },
        user: { id: "unknown-user", email: "unknown@example.com" },
      },
      error: null,
    });
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    authSignOutMock.mockResolvedValue({ error: null });

    await expect(signInBackofficeWithPassword("unknown@example.com", "password", [])).rejects.toThrow(
      "등록되지 않은 백오피스 계정입니다.",
    );
    expect(authSignOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});
