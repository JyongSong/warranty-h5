import { describe, expect, it } from "vitest";
import { isBackofficeMenuItemActive, isBackofficeSubmenuExpanded } from "./BackofficeSidebarNav";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("isBackofficeMenuItemActive", () => {
  it("marks exact menu paths and their nested detail paths as active", () => {
    expect(isBackofficeMenuItemActive("/backoffice/installations", "/backoffice/installations")).toBe(true);
    expect(
      isBackofficeMenuItemActive(
        "/backoffice/installations?statusView=active",
        "/backoffice/installations?statusView=active",
      ),
    ).toBe(true);
    expect(isBackofficeMenuItemActive("/backoffice/installations/123", "/backoffice/installations")).toBe(true);
    expect(isBackofficeMenuItemActive("/backoffice/installations?status=SMS_FAILED", "/backoffice/installations")).toBe(
      true,
    );
  });

  it("does not mark similarly prefixed sibling paths as active", () => {
    expect(isBackofficeMenuItemActive("/backoffice/installation-order-source", "/backoffice/installations")).toBe(
      false,
    );
    expect(isBackofficeMenuItemActive("/backoffice/installations-archive", "/backoffice/installations")).toBe(false);
    expect(isBackofficeMenuItemActive("/backoffice/installations", "/backoffice")).toBe(false);
    expect(isBackofficeMenuItemActive("/backoffice/settings/system-settings", "/backoffice/settings")).toBe(true);
  });

  it("keeps active submenus open only while the desktop sidebar is expanded", () => {
    const activeSettingsState = {
      isActive: true,
      manuallyExpandedPathname: null,
      collapsedPathname: null,
      pathname: "/backoffice/settings/system-status",
    };

    expect(isBackofficeSubmenuExpanded({ ...activeSettingsState, collapsed: false })).toBe(true);
    expect(isBackofficeSubmenuExpanded({ ...activeSettingsState, collapsed: true })).toBe(false);
  });

  it("does not keep a manually expanded submenu open after the route changes", () => {
    const manuallyExpandedOnOperationsPage = {
      isActive: false,
      manuallyExpandedPathname: "/backoffice/installations",
      collapsedPathname: null,
    };

    expect(
      isBackofficeSubmenuExpanded({
        ...manuallyExpandedOnOperationsPage,
        collapsed: false,
        pathname: "/backoffice/installations",
      }),
    ).toBe(true);
    expect(
      isBackofficeSubmenuExpanded({
        ...manuallyExpandedOnOperationsPage,
        collapsed: false,
        pathname: "/backoffice/installation-order-source",
      }),
    ).toBe(false);
    expect(
      isBackofficeSubmenuExpanded({
        ...manuallyExpandedOnOperationsPage,
        collapsed: true,
        pathname: "/backoffice/installation-order-source",
      }),
    ).toBe(false);
  });

  it("renders sidebar menu labels with a controlled medium weight", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).not.toContain('className="font-semibold">{item.label}</span>');
    expect(source).toContain("font-medium text-slate-800");
  });

  it("keeps settings helper pages as nested settings sidebar routes", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).toContain('href: "/backoffice/settings"');
    expect(source).toContain('label: "설정"');
    expect(source).not.toContain('href: "/backoffice/system-settings"');
    expect(source).not.toContain('href: "/backoffice/data-import"');
    expect(source).not.toContain('href: "/backoffice/sms-templates"');
    expect(source).not.toContain('href: "/backoffice/json-entities"');
    expect(source).toContain('href: "/backoffice/settings/system-settings"');
    expect(source).toContain('href: "/backoffice/settings/system-status"');
    expect(source).toContain('label: "시스템 상태"');
    expect(source).not.toContain('href: "/backoffice/settings/data-import/shipped-devices"');
    expect(source).not.toContain('label: "출고 기기 가져오기"');
    expect(source).toContain('href: "/backoffice/settings/data-import/installers"');
    expect(source).toContain('label: "설치 기사 가져오기"');
    expect(source).toContain('href: "/backoffice/settings/sms-templates"');
    expect(source).toContain('href: "/backoffice/settings/users"');
    expect(source).toContain('label: "유저 관리"');
    expect(source).toContain('href: "/backoffice/settings/json-entities"');
    expect(source).toContain('label: "매핑/라벨 확인"');

    const settingsSubMenuOrder = [
      'href: "/backoffice/settings/users"',
      'href: "/backoffice/settings/system-settings"',
      'href: "/backoffice/settings/system-status"',
      'href: "/backoffice/settings/sms-templates"',
      'href: "/backoffice/settings/data-import/installers"',
      'href: "/backoffice/settings/json-entities"',
    ];

    const settingsSubMenuIndexes = settingsSubMenuOrder.map((item) => source.indexOf(item));
    expect(settingsSubMenuIndexes).not.toContain(-1);
    expect(settingsSubMenuIndexes).toEqual([...settingsSubMenuIndexes].sort((a, b) => a - b));
  });

  it("uses a server-rendered shared loading UI", () => {
    const loadingSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "loading.tsx"), "utf8");

    expect(loadingSource).not.toContain('"use client"');
    expect(loadingSource).toContain('title="페이지를 불러오는 중"');
    expect(loadingSource).toContain("페이지를 불러오는 중입니다.");
  });

  it("shows the order dashboard and frequently used operational pages in the sidebar", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).toContain('label: "주문 대시보드"');
    expect(source).toContain('href: "/backoffice/installation-dashboard"');
    expect(source).not.toContain('href: "/backoffice",');
    expect(source).toContain('label: "ERP 주문 데이터"');
    expect(source).toContain('label: "설치 업무 큐"');
    expect(source).toContain('href: "/backoffice/installations?statusView=active"');
    expect(source).toContain('label: "주문 검색"');
    expect(source).toContain('href: "/backoffice/installation-search"');
    expect(source).not.toContain('label: "설치 주문 관리"');
    expect(source).toContain('label: "설정"');
    expect(source).not.toContain('label: "진행 주문"');
    expect(source).not.toContain('label: "배정 승인 대기"');
    expect(source).not.toContain('label: "완료/취소 이력"');
    expect(source).not.toContain('href: "/backoffice/installation-assignment-requests"');
    expect(source).not.toContain('href: "/backoffice/installation-history"');
    expect(source).not.toContain('label: "설치 주문"');
    expect(source).not.toContain('label: "배정 요청"');
    expect(source).not.toContain('label: "처리 이력"');
    expect(source).not.toContain('label: "배정 관리"');
    expect(source).not.toContain('label: "데이터 가져오기"');
  });

  it("redirects the settings landing page to a concrete settings screen", () => {
    const settingsPagePath = join(process.cwd(), "src", "app", "backoffice", "settings", "page.tsx");
    const systemSettingsPagePath = join(
      process.cwd(),
      "src",
      "app",
      "backoffice",
      "settings",
      "system-settings",
      "page.tsx",
    );
    const smsTemplatesPagePath = join(
      process.cwd(),
      "src",
      "app",
      "backoffice",
      "settings",
      "sms-templates",
      "page.tsx",
    );
    const systemStatusPagePath = join(
      process.cwd(),
      "src",
      "app",
      "backoffice",
      "settings",
      "system-status",
      "page.tsx",
    );
    const dataImportPagePath = join(
      process.cwd(),
      "src",
      "app",
      "backoffice",
      "settings",
      "data-import",
      "page.tsx",
    );
    const usersPagePath = join(
      process.cwd(),
      "src",
      "app",
      "backoffice",
      "settings",
      "users",
      "page.tsx",
    );

    expect(existsSync(settingsPagePath)).toBe(true);
    expect(existsSync(systemSettingsPagePath)).toBe(true);
    expect(existsSync(systemStatusPagePath)).toBe(true);
    expect(existsSync(smsTemplatesPagePath)).toBe(true);
    expect(existsSync(dataImportPagePath)).toBe(true);
    expect(existsSync(usersPagePath)).toBe(true);
    expect(existsSync(join(process.cwd(), "src", "app", "backoffice", "settings", "json-entities"))).toBe(true);

    const source = readFileSync(settingsPagePath, "utf8");
    expect(source).toContain('redirect("/backoffice/settings/users")');
    expect(source).not.toContain("SettingsSectionLayout");
    expect(source).not.toContain("왼쪽 메뉴에서");
    expect(source).not.toContain("<h2");

    const systemStatusPageSource = readFileSync(systemStatusPagePath, "utf8");
    expect(systemStatusPageSource).toContain("overflow-auto");
    expect(systemStatusPageSource).toContain("whitespace-nowrap");
    expect(systemStatusPageSource).not.toContain("table-fixed");
  });

  it("renders settings submenus from the expanded settings menu", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).toContain("subItems");
    expect(source).toContain("aria-expanded={isExpanded}");
    expect(source).toContain("setManuallyExpandedPathname(pathname)");
    expect(source).toContain("setCollapsedPathname(isActive ? pathname : null)");
    expect(source).toContain("isExpanded && item.subItems");
    expect(source).toContain('aria-label={`${item.label} 하위 메뉴`}');
  });

  it("keeps the desktop settings submenu mounted while navigating to the first child page", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).toContain("function handleSubmenuNavigate()");
    expect(source).toContain("if (collapsed || onNavigate)");
    expect(source).toContain("setManuallyExpandedPathname(null)");
    expect(source).toContain("setCollapsedPathname(null)");
    expect(source).toContain("onNavigate?.()");
    expect(source).toContain("onClick={handleSubmenuNavigate}");
  });

  it("supports a mobile hamburger menu without duplicating menu item state", () => {
    const layoutSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "layout.tsx"), "utf8");
    const desktopSidebarSource = readFileSync(
      join(process.cwd(), "src", "app", "backoffice", "BackofficeDesktopSidebar.tsx"),
      "utf8",
    );
    const mobileNavSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeMobileNav.tsx"), "utf8");
    const sidebarSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(layoutSource).toContain("BackofficeMobileNav");
    expect(layoutSource).toContain("<BackofficeDesktopSidebar");
    expect(desktopSidebarSource).toContain('collapsed ? "w-16" : "w-64"');
    expect(mobileNavSource).toContain('aria-label={open ? "백오피스 메뉴 닫기" : "백오피스 메뉴 열기"}');
    expect(mobileNavSource).toContain('className="sticky top-0 z-30 border-b border-zinc-200 bg-white md:hidden"');
    expect(mobileNavSource).toContain('className="relative h-full w-72 max-w-[82vw] border-r border-slate-200 bg-white shadow-xl"');
    expect(mobileNavSource).toContain("<BackofficeSidebarNav");
    expect(mobileNavSource).toContain("const pathname = usePathname()");
    expect(mobileNavSource).toContain("setOpen(false);\n  }, [pathname]);");
    expect(mobileNavSource).toContain('href="/backoffice"\n          onClick={() => setOpen(false)}');
    expect(sidebarSource).toContain("onNavigate?: () => void");
    expect(sidebarSource).toContain("onClick={onNavigate}");
  });

  it("supports a persistent minimized desktop sidebar", () => {
    const desktopSidebarSource = readFileSync(
      join(process.cwd(), "src", "app", "backoffice", "BackofficeDesktopSidebar.tsx"),
      "utf8",
    );
    const sidebarSource = readFileSync(
      join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"),
      "utf8",
    );

    expect(desktopSidebarSource).toContain("backoffice-sidebar-collapsed-v1");
    expect(desktopSidebarSource).toContain("window.localStorage.getItem");
    expect(desktopSidebarSource).toContain("window.localStorage.setItem");
    expect(desktopSidebarSource).toContain('collapsed ? "w-16" : "w-64"');
    expect(desktopSidebarSource).toContain('aria-label={collapsed ? "사이드바 펼치기" : "사이드바 최소화"}');
    expect(desktopSidebarSource).toContain("iconOnly={collapsed}");
    expect(sidebarSource).toContain("collapsed?: boolean");
    expect(sidebarSource).toContain('title={collapsed ? item.label : undefined}');
    expect(sidebarSource).toContain("group-hover/sidebar-item:opacity-100");
  });

  it("renders the logged-in account as a compact account panel menu button", () => {
    const layoutSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "layout.tsx"), "utf8");
    const desktopSidebarSource = readFileSync(
      join(process.cwd(), "src", "app", "backoffice", "BackofficeDesktopSidebar.tsx"),
      "utf8",
    );
    const mobileNavSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeMobileNav.tsx"), "utf8");
    const userMenuSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeUserMenu.tsx"), "utf8");

    expect(layoutSource).toContain("<BackofficeDesktopSidebar userEmail={user.email} />");
    expect(desktopSidebarSource).toContain("<BackofficeUserMenu email={userEmail} iconOnly={collapsed} openUpward />");
    expect(desktopSidebarSource).toContain('"mt-auto border-t border-slate-200 bg-white"');
    expect(mobileNavSource).toContain("<BackofficeUserMenu email={userEmail} compact />");
    expect(mobileNavSource).not.toContain("{userEmail}</p>");
    expect(userMenuSource).toContain("email: string");
    expect(userMenuSource).toContain("compact?: boolean");
    expect(userMenuSource).toContain("{email}");
    expect(userMenuSource).toContain("rounded-md");
    expect(userMenuSource).not.toContain("로그인됨");
    expect(userMenuSource).toContain('aria-label={`${email} 계정 메뉴`}');
    expect(userMenuSource).toContain("border-rose-100");
    expect(userMenuSource).toContain("text-rose-700");
  });

  it("opens a password change dialog from the logged-in account menu", () => {
    const userMenuSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeUserMenu.tsx"), "utf8");
    const dialogSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficePasswordDialog.tsx"), "utf8");

    expect(userMenuSource).toContain("비밀번호 변경");
    expect(userMenuSource).toContain("<BackofficePasswordDialog");
    expect(dialogSource).toContain("changeBackofficePasswordAction({");
    expect(dialogSource).not.toContain("/api/login/change-password");
    expect(dialogSource).toContain('autoComplete="current-password"');
    expect(dialogSource).toContain('autoComplete="new-password"');
    expect(dialogSource).toContain('role="dialog"');
    expect(dialogSource).toContain("비밀번호가 변경되었습니다.");
  });
});
