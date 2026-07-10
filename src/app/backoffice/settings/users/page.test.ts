import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBackofficeUsers } from "@/lib/backoffice/users";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { DeleteBackofficeUserForm } from "./DeleteBackofficeUserForm";
import BackofficeUsersPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/backoffice/users", () => ({
  listBackofficeUsers: vi.fn(),
}));

vi.mock("@/lib/login/backofficeAuth", () => ({
  requireBackofficeUserPage: vi.fn(),
}));

vi.mock("./actions", () => ({
  createBackofficeUserAction: vi.fn(),
  deleteBackofficeUserAction: vi.fn(),
  updateBackofficeUserAction: vi.fn(),
}));

function getRenderedText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getRenderedText).join("");
  if (isValidElement(node)) {
    return getRenderedText((node.props as { children?: unknown }).children);
  }
  return "";
}

function collectElementsByName(node: unknown, name: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => collectElementsByName(child, name));
  if (!isValidElement(node)) return [];

  const props = node.props as { name?: string; children?: unknown };
  const matches: unknown[] = props.name === name ? [node] : [];
  return matches.concat(collectElementsByName(props.children, name));
}

function collectElementsByType(node: unknown, type: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => collectElementsByType(child, type));
  if (!isValidElement(node)) return [];

  const props = node.props as { children?: unknown };
  const matches: unknown[] = node.type === type ? [node] : [];
  return matches.concat(collectElementsByType(props.children, type));
}

function collectElementsByClassPart(node: unknown, classPart: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => collectElementsByClassPart(child, classPart));
  if (!isValidElement(node)) return [];

  const props = node.props as { children?: unknown; className?: string };
  const matches: unknown[] = props.className?.includes(classPart) ? [node] : [];
  return matches.concat(collectElementsByClassPart(props.children, classPart));
}

function findPropsByComponentName(
  node: unknown,
  componentName: string,
): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPropsByComponentName(child, componentName);
      if (found) return found;
    }
  }

  if (!isValidElement(node)) return null;

  const type = node.type as { name?: string };
  if (type.name === componentName) {
    return node.props as Record<string, unknown>;
  }

  return findPropsByComponentName((node.props as { children?: unknown }).children, componentName);
}

function collectPropsByComponentName(node: unknown, componentName: string): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectPropsByComponentName(child, componentName));
  }

  if (!isValidElement(node)) return [];

  const props = node.props as { children?: unknown };
  const type = node.type as { name?: string };
  const matches = type.name === componentName ? [props as Record<string, unknown>] : [];
  return matches.concat(collectPropsByComponentName(props.children, componentName));
}

function createUser(overrides: {
  id?: string;
  supabaseUserId?: string | null;
  email?: string;
  level?: number;
} = {}) {
  const createdAt = new Date("2026-06-23T14:00:00.000Z");

  return {
    id: overrides.id ?? "user-1",
    supabaseUserId: overrides.supabaseUserId ?? "supabase-user-1",
    email: overrides.email ?? "user@example.com",
    level: overrides.level ?? 10,
    lastLoginAt: new Date("2026-06-23T14:43:00.000Z"),
    createdAt,
    updatedAt: createdAt,
  };
}

describe("BackofficeUsersPage", () => {
  beforeEach(() => {
    vi.mocked(requireBackofficeUserPage).mockReset();
    vi.mocked(listBackofficeUsers).mockReset();
    vi.mocked(listBackofficeUsers).mockResolvedValue([]);
  });

  it("shows server action errors from search params", async () => {
    const element = await BackofficeUsersPage({
      searchParams: Promise.resolve({
        userActionError: "SELF_LEVEL_DOWN_NOT_ALLOWED",
      }),
    });
    const text = getRenderedText(element);

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice/settings/users", 1);
    expect(text).toContain("현재 로그인한 관리자의 권한은 대기로 변경할 수 없습니다.");
  });

  it("renders the total count next to the title without the settings eyebrow", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([
      createUser(),
      createUser({
        id: "user-2",
        supabaseUserId: null,
        email: "pending@example.com",
        level: 0,
      }),
    ]);

    const element = await BackofficeUsersPage();
    const pageHeaderProps = findPropsByComponentName(element, "BackofficePageHeader");
    const text = getRenderedText(element);

    expect(text).not.toContain("설정");
    expect(pageHeaderProps).toEqual(expect.objectContaining({ title: "유저 관리", meta: "총 2명" }));
  });

  it("separates the create form and user list into labeled sections", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([createUser()]);

    const element = await BackofficeUsersPage();
    const text = getRenderedText(element);

    expect(text).toContain("유저 추가");
    expect(text).toContain("초대할 이메일과 초기 레벨을 입력해 주세요.");
    expect(text).toContain("유저 목록");
    expect(text).toContain("가입 상태, 레벨, 최근 로그인 정보를 확인하고 관리합니다.");
  });

  it("renders level as a numeric input for create and a row edit component for updates", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([createUser()]);

    const element = await BackofficeUsersPage();
    const levelFields = collectElementsByName(element, "level");
    const levelForms = collectPropsByComponentName(element, "BackofficeUserLevelForm");

    expect(levelFields).toHaveLength(1);
    expect(
      levelFields.map((field) => (field as { props: { type?: string; min?: string; step?: string } }).props),
    ).toEqual([expect.objectContaining({ type: "number", min: "0", step: "1" })]);
    expect(levelForms).toHaveLength(1);
    expect(levelForms[0]).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: "user@example.com", level: 10 }),
      }),
    );
  });

  it("keeps the create level input inside its grid column", async () => {
    const element = await BackofficeUsersPage();
    const levelField = collectElementsByName(element, "level")[0] as {
      props: { className?: string };
    };

    expect(levelField.props.className).toContain("w-full");
    expect(levelField.props.className).toContain("min-w-0");
  });

  it("does not repeat the row level as helper text in the actions column", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([createUser()]);

    const element = await BackofficeUsersPage();
    const text = getRenderedText(element);

    expect(text).not.toContain("레벨 10");
  });

  it("renders existing user emails as text instead of editable inputs", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([createUser()]);

    const element = await BackofficeUsersPage();
    const emailFields = collectElementsByName(element, "email");
    const text = getRenderedText(element);

    expect(emailFields).toHaveLength(1);
    expect((emailFields[0] as { props: { type?: string } }).props.type).toBe("email");
    expect(text).toContain("user@example.com");
  });

  it("places the row level edit component outside the actions column", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([createUser()]);

    const element = await BackofficeUsersPage();
    const cells = collectElementsByType(element, "td");
    const levelCell = cells.find(
      (cell) => collectPropsByComponentName(cell, "BackofficeUserLevelForm").length === 1,
    );
    const actionCell = cells.find((cell) => collectElementsByType(cell, DeleteBackofficeUserForm).length === 1);

    expect(levelCell).toBeDefined();
    expect(actionCell).toBeDefined();
  });

  it("prevents user table cells from wrapping", async () => {
    vi.mocked(listBackofficeUsers).mockResolvedValue([createUser({ supabaseUserId: null })]);

    const element = await BackofficeUsersPage();
    const table = collectElementsByType(element, "table")[0] as {
      props: { className?: string };
    };
    const statusBadge = collectElementsByClassPart(element, "min-w-16")[0] as {
      props: { className?: string };
    };

    expect(table.props.className).toContain("whitespace-nowrap");
    expect(statusBadge.props.className).toContain("whitespace-nowrap");
  });

  it("caps the desktop email field width in the create form", async () => {
    const element = await BackofficeUsersPage();
    const createForm = collectElementsByClassPart(element, "md:grid-cols-")[0] as {
      props: { className?: string };
    };

    expect(createForm.props.className).toContain("md:grid-cols-[minmax(320px,560px)_120px_auto]");
    expect(createForm.props.className).toContain("md:gap-x-3");
  });

  it("adds visible spacing between the create level field and submit button", async () => {
    const element = await BackofficeUsersPage();
    const actionWrapper = collectElementsByClassPart(element, "items-end")[0] as {
      props: { className?: string };
    };

    expect(actionWrapper.props.className).not.toContain("ml-4");
  });
});
