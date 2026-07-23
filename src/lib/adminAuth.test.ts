import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { requireAdminApi } from "./adminAuth";

vi.mock("@/lib/login/backofficeAuth", () => ({
  getCurrentBackofficeUser: vi.fn(),
  requireBackofficeUserPage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const getCurrentBackofficeUserMock = vi.mocked(getCurrentBackofficeUser);

describe("requireAdminApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies level-zero users by default", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "user-0",
      supabaseUserId: "supabase-user-0",
      email: "disabled@example.com",
      level: 0,
    });

    const result = await requireAdminApi();

    expect(result.admin).toBeNull();
    expect(result.errorResponse?.status).toBe(403);
    await expect(result.errorResponse?.json()).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("allows level-one users by default", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "user-1",
      supabaseUserId: "supabase-user-1",
      email: "admin@example.com",
      level: 1,
    });

    const result = await requireAdminApi();

    expect(result.errorResponse).toBeNull();
    expect(result.admin).toEqual({
      id: "user-1",
      name: "admin",
      level: 1,
    });
  });
});
