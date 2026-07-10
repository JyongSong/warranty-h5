import { describe, expect, it } from "vitest";
import { isBackofficeMenuItemActive } from "./BackofficeSidebarNav";
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

  it("uses the current backoffice route title while shared loading UI is shown", () => {
    const loadingSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "loading.tsx"), "utf8");

    expect(loadingSource).toContain("usePathname");
    expect(loadingSource).toContain("getBackofficeLoadingTitle(pathname)");
    expect(loadingSource).toContain('href: "/backoffice", title: "운영 현황"');
    expect(loadingSource).not.toContain('title="Backoffice"');
    expect(loadingSource).toContain('if (normalizedPathname === "/backoffice")');
    expect(loadingSource).toContain("<BackofficeDashboardLoading />");
    expect(loadingSource).toContain("신규 주문과 설치 완료 추이 로딩 중");
    expect(loadingSource).toContain("현재 대기 상태 분포 로딩 중");
    expect(loadingSource).toContain('href: "/backoffice/settings/system-status", title: "시스템 상태"');
    expect(loadingSource).toContain('href: "/backoffice/settings/system-settings", title: "시스템 설정"');
    expect(loadingSource).not.toContain('href: "/backoffice/settings/data-import/shipped-devices", title: "출고 기기 가져오기"');
    expect(loadingSource).toContain('href: "/backoffice/settings/data-import/installers", title: "설치 기사 가져오기"');
  });

  it("shows only frequently used operational pages and the settings entry in the sidebar", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).not.toContain('label: "운영 현황"');
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

  it("keeps the settings landing page blank and moves helper pages under settings routes", () => {
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
    const systemStatusLoadingPath = join(
      process.cwd(),
      "src",
      "app",
      "backoffice",
      "settings",
      "system-status",
      "loading.tsx",
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
    expect(existsSync(systemStatusLoadingPath)).toBe(true);
    expect(existsSync(smsTemplatesPagePath)).toBe(true);
    expect(existsSync(dataImportPagePath)).toBe(true);
    expect(existsSync(usersPagePath)).toBe(true);
    expect(existsSync(join(process.cwd(), "src", "app", "backoffice", "settings", "json-entities"))).toBe(true);

    const source = readFileSync(settingsPagePath, "utf8");
    expect(source).toContain('requireBackofficeUserPage("/backoffice/settings", 1)');
    expect(source).not.toContain("SettingsSectionLayout");
    expect(source).not.toContain("왼쪽 메뉴에서");
    expect(source).not.toContain("<h2");

    const systemStatusLoadingSource = readFileSync(systemStatusLoadingPath, "utf8");
    const systemStatusPageSource = readFileSync(systemStatusPagePath, "utf8");
    expect(systemStatusPageSource).toContain("overflow-auto");
    expect(systemStatusPageSource).toContain("whitespace-nowrap");
    expect(systemStatusPageSource).not.toContain("table-fixed");
    expect(systemStatusLoadingSource).toContain('title="시스템 상태"');
    expect(systemStatusLoadingSource).toContain('className="max-w-4xl"');
    expect(systemStatusLoadingSource).toContain("overflow-auto");
    expect(systemStatusLoadingSource).toContain("whitespace-nowrap");
    expect(systemStatusLoadingSource).not.toContain("table-fixed");
    expect(systemStatusLoadingSource).toContain("자동 작업 실행 상태");
    expect(systemStatusLoadingSource).toContain("설치 cron 작업별 마지막 실행 상태 로딩 중");
    expect(systemStatusLoadingSource).toContain("설치 주문 동기화");
    expect(systemStatusLoadingSource).toContain("설치 Dispatcher");
  });

  it("renders settings submenus from the expanded settings menu", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(source).toContain("subItems");
    expect(source).toContain("aria-expanded={isExpanded}");
    expect(source).toContain("setIsManuallyExpanded(true)");
    expect(source).toContain("setCollapsedPathname(isActive ? pathname : null)");
    expect(source).toContain("isExpanded && item.subItems");
    expect(source).toContain('aria-label={`${item.label} 하위 메뉴`}');
  });

  it("supports a mobile hamburger menu without duplicating menu item state", () => {
    const layoutSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "layout.tsx"), "utf8");
    const mobileNavSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeMobileNav.tsx"), "utf8");
    const sidebarSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeSidebarNav.tsx"), "utf8");

    expect(layoutSource).toContain("BackofficeMobileNav");
    expect(layoutSource).toContain('className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block"');
    expect(mobileNavSource).toContain('aria-label={open ? "백오피스 메뉴 닫기" : "백오피스 메뉴 열기"}');
    expect(mobileNavSource).toContain('className="sticky top-0 z-30 border-b border-zinc-200 bg-white md:hidden"');
    expect(mobileNavSource).toContain('className="relative h-full w-72 max-w-[82vw] border-r border-slate-200 bg-white shadow-xl"');
    expect(mobileNavSource).toContain("<BackofficeSidebarNav");
    expect(sidebarSource).toContain("onNavigate?: () => void");
    expect(sidebarSource).toContain("onClick={onNavigate}");
  });

  it("renders the logged-in account as a compact account panel menu button", () => {
    const layoutSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "layout.tsx"), "utf8");
    const mobileNavSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeMobileNav.tsx"), "utf8");
    const userMenuSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeUserMenu.tsx"), "utf8");

    expect(layoutSource).toContain("<BackofficeUserMenu email={user.email} />");
    expect(layoutSource).not.toContain("{user.email}</p>");
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
});
