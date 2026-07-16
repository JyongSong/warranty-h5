import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBackofficeUsers } from "@/lib/backoffice/users";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { BackofficeUserCreateDialog } from "./BackofficeUserCreateDialog";
import { BackofficeUserPasswordResetForm } from "./BackofficeUserPasswordResetForm";
import { DeleteBackofficeUserForm } from "./DeleteBackofficeUserForm";
import BackofficeUsersPage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/backoffice/users", () => ({ listBackofficeUsers: vi.fn() }));
vi.mock("@/lib/login/backofficeAuth", () => ({ requireBackofficeUserPage: vi.fn() }));
vi.mock("./actions", () => ({
  createBackofficeUserAction: vi.fn(),
  deleteBackofficeUserAction: vi.fn(),
  resetBackofficeUserPasswordAction: vi.fn(),
  updateBackofficeUserAction: vi.fn(),
}));

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return "";
}

function collect(node: unknown, predicate: (element: React.ReactElement) => boolean): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => collect(child, predicate));
  if (!isValidElement(node)) return [];
  const matches = predicate(node) ? [node] : [];
  return matches.concat(collect((node.props as { children?: unknown }).children, predicate));
}

function user(supabaseUserId: string | null = "supabase-user-1") {
  const date = new Date("2026-06-23T14:43:00.000Z");
  return {
    id: "user-1",
    supabaseUserId,
    email: "user@example.com",
    level: 1,
    lastLoginAt: date,
    createdAt: date,
    updatedAt: date,
  };
}

describe("BackofficeUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBackofficeUsers).mockResolvedValue([]);
  });

  it("requires admin access and renders initial-password account creation", async () => {
    const element = await BackofficeUsersPage({});
    const createDialog = collect(element, (item) => item.type === BackofficeUserCreateDialog);
    const createDialogSource = readFileSync(
      join(process.cwd(), "src", "app", "backoffice", "settings", "users", "BackofficeUserCreateDialog.tsx"),
      "utf8",
    );

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice/settings/users", 1);
    expect(createDialog).toHaveLength(1);
    expect(createDialog[0].props).toHaveProperty("action");
    expect(createDialogSource).toContain('role="dialog"');
    expect(createDialogSource).toContain('aria-modal="true"');
    expect(createDialogSource).toContain('name="email"');
    expect(createDialogSource).toContain('name="level"');
    expect(createDialogSource).toContain('name="password"');
    expect(createDialogSource).toContain('name="confirmPassword"');
    expect(textOf(element)).not.toContain("초대");
  });

  it("shows Supabase connection status and account management actions", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([user()]);
    const element = await BackofficeUsersPage({});

    expect(textOf(element)).toContain("계정 생성");
    expect(collect(element, (item) => item.type === BackofficeUserPasswordResetForm)).toHaveLength(1);
    expect(collect(element, (item) => item.type === DeleteBackofficeUserForm)).toHaveLength(1);
  });

  it("shows the user count immediately before the create-user button", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([user()]);
    const element = await BackofficeUsersPage({});
    const pageSource = readFileSync(
      join(process.cwd(), "src", "app", "backoffice", "settings", "users", "page.tsx"),
      "utf8",
    );

    expect(textOf(element)).toContain("총 1명");
    expect(pageSource).not.toContain('meta={`총 ${users.length}명`}');
    expect(pageSource.indexOf("총 {users.length}명")).toBeLessThan(
      pageSource.indexOf("<BackofficeUserCreateDialog"),
    );
  });

  it("disables password reset for an unlinked legacy row", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([user(null)]);
    const element = await BackofficeUsersPage({});
    const reset = collect(element, (item) => item.type === BackofficeUserPasswordResetForm)[0];

    expect(textOf(element)).toContain("계정 미연결");
    expect((reset.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it("shows actionable server errors", async () => {
    const element = await BackofficeUsersPage({
      searchParams: Promise.resolve({ userActionError: "USER_AUTH_CREATE_FAILED" }),
    });

    expect(textOf(element)).toContain("Supabase 로그인 계정 생성에 실패했습니다.");
  });
});
