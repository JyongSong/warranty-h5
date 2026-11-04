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
      email: "admin@example.com",
      displayName: null,
      level: 1,
    });
  });

  it("lets level-two admins edit but tells level-three viewers they are read-only", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "user-2",
      supabaseUserId: "supabase-user-2",
      email: "manager@example.com",
      name: "매니저",
      level: 2,
    });
    const asAdmin = await requireAdminApi();
    expect(asAdmin.errorResponse).toBeNull();
    expect(asAdmin.admin?.name).toBe("매니저");

    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "user-3",
      supabaseUserId: "supabase-user-3",
      email: "viewer@example.com",
      name: null,
      level: 3,
    });
    const asViewer = await requireAdminApi();
    expect(asViewer.errorResponse?.status).toBe(403);
    await expect(asViewer.errorResponse?.json()).resolves.toEqual({
      error: "조회 전용 계정은 수정할 수 없습니다.",
    });
    await expect(requireAdminApi("view")).resolves.toMatchObject({ errorResponse: null });
  });

  it("keeps settings routes for level-one only", async () => {
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "user-2",
      supabaseUserId: "supabase-user-2",
      email: "manager@example.com",
      name: null,
      level: 2,
    });
    const result = await requireAdminApi("settings");
    expect(result.errorResponse?.status).toBe(403);
    await expect(result.errorResponse?.json()).resolves.toEqual({ error: "FORBIDDEN" });
  });
});
