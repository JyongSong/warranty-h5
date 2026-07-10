import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptPii } from "@/lib/piiCrypto";
import { prisma } from "@/lib/prisma";
import {
  getCurrentBackofficeUser,
  signInBackofficeWithPassword,
  type SupabaseCookieToSet,
} from "./backofficeAuth";

const { authGetUserMock, authSignInWithPasswordMock } = vi.hoisted(() => ({
  authGetUserMock: vi.fn(),
  authSignInWithPasswordMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: authGetUserMock,
      signInWithPassword: authSignInWithPasswordMock,
    },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    backofficeUser: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const backofficeUserCreateMock = vi.mocked(prisma.backofficeUser.create);
const backofficeUserFindFirstMock = vi.mocked(prisma.backofficeUser.findFirst);
const backofficeUserFindUniqueMock = vi.mocked(prisma.backofficeUser.findUnique);
const backofficeUserUpdateMock = vi.mocked(prisma.backofficeUser.update);

describe("getCurrentBackofficeUser", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      PII_ENCRYPTION_KEY: "current-pii-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("refreshes an undecryptable local email from the authenticated Supabase user", async () => {
    authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: "supabase-user-1",
          email: "Admin@Example.COM",
        },
      },
      error: null,
    });
    backofficeUserFindUniqueMock.mockResolvedValue({
      id: "backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "enc:v1:stale:stale:stale",
      level: 1,
    } as never);
    backofficeUserUpdateMock.mockResolvedValue({
      id: "backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "enc:v1:updated:updated:updated",
      emailHash: null,
      level: 1,
      lastLoginAt: new Date("2026-06-18T00:00:00.000Z"),
      createdAt: new Date("2026-06-18T00:00:00.000Z"),
      updatedAt: new Date("2026-06-18T00:00:00.000Z"),
    } as never);

    const user = await getCurrentBackofficeUser();

    expect(user).toEqual({
      id: "backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      email: "admin@example.com",
      level: 1,
    });
    expect(backofficeUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "backoffice-user-1" },
      data: {
        emailEncrypted: expect.stringMatching(/^enc:v1:/),
        emailHash: expect.any(String),
      },
    });

    const updateData = backofficeUserUpdateMock.mock.calls[0]?.[0].data as {
      emailEncrypted: string;
    };
    expect(decryptPii(updateData.emailEncrypted)).toBe("admin@example.com");
  });

  it("returns null for an undecryptable local email when Supabase has no email", async () => {
    authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: "supabase-user-1",
          email: null,
        },
      },
      error: null,
    });
    backofficeUserFindUniqueMock.mockResolvedValue({
      id: "backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "enc:v1:stale:stale:stale",
      level: 1,
    } as never);

    await expect(getCurrentBackofficeUser()).resolves.toBeNull();
    expect(backofficeUserUpdateMock).not.toHaveBeenCalled();
  });

  it("uses the Supabase email without rewriting PII when encryption is not configured", async () => {
    process.env = {
      ...process.env,
      PII_ENCRYPTION_KEY: "",
      PII_HASH_KEY: "",
    };
    authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: "supabase-user-1",
          email: "Admin@Example.COM",
        },
      },
      error: null,
    });
    backofficeUserFindUniqueMock.mockResolvedValue({
      id: "backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "enc:v1:stale:stale:stale",
      level: 1,
    } as never);

    await expect(getCurrentBackofficeUser()).resolves.toEqual({
      id: "backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      email: "admin@example.com",
      level: 1,
    });
    expect(backofficeUserUpdateMock).not.toHaveBeenCalled();
  });
});

describe("signInBackofficeWithPassword", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      PII_ENCRYPTION_KEY: "current-pii-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("links a pending backoffice user by email hash on first Supabase sign-in", async () => {
    authSignInWithPasswordMock.mockResolvedValue({
      data: {
        session: { access_token: "access-token" },
        user: {
          id: "supabase-user-1",
          email: "Admin@Example.COM",
        },
      },
      error: null,
    });
    backofficeUserFindUniqueMock.mockResolvedValue(null);
    backofficeUserFindFirstMock.mockResolvedValue({
      id: "pending-backoffice-user-1",
      supabaseUserId: null,
      emailEncrypted: "admin@example.com",
      level: 1,
    } as never);
    backofficeUserUpdateMock.mockResolvedValue({
      id: "pending-backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      emailEncrypted: "admin@example.com",
      level: 1,
    } as never);

    const cookiesToSet: SupabaseCookieToSet[] = [];
    const user = await signInBackofficeWithPassword("Admin@Example.COM", "password", cookiesToSet);

    expect(user).toEqual({
      id: "pending-backoffice-user-1",
      supabaseUserId: "supabase-user-1",
      email: "admin@example.com",
      level: 1,
    });
    expect(backofficeUserFindUniqueMock).toHaveBeenCalledWith({
      where: { supabaseUserId: "supabase-user-1" },
      select: {
        id: true,
        supabaseUserId: true,
        emailEncrypted: true,
        level: true,
      },
    });
    expect(backofficeUserFindFirstMock).toHaveBeenCalledWith({
      where: {
        supabaseUserId: null,
        emailHash: expect.any(String),
      },
      select: {
        id: true,
        supabaseUserId: true,
        emailEncrypted: true,
        level: true,
      },
    });
    expect(backofficeUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "pending-backoffice-user-1" },
      data: {
        supabaseUserId: "supabase-user-1",
        emailEncrypted: expect.stringMatching(/^enc:v1:/),
        emailHash: expect.any(String),
        lastLoginAt: expect.any(Date),
      },
      select: {
        id: true,
        supabaseUserId: true,
        emailEncrypted: true,
        level: true,
      },
    });
    expect(backofficeUserCreateMock).not.toHaveBeenCalled();
  });
});
