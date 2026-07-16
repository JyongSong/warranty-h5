import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BackofficePage from "./page";
import InstallationOrderSourcePage from "./installation-order-source/page";
import InstallationSearchPage from "./installation-search/page";
import InstallationSearchDetailPage from "./installation-search/[installationId]/page";
import InstallationsPage from "./installations/page";
import InstallationDetailPage from "./installations/[installationId]/page";
import { InstallationOrderListView } from "./installations/views";
import {
  getBackofficeDashboardChartSummary,
  getBackofficeSystemStatusSummary,
} from "@/lib/backoffice/dashboard";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { listActiveInstallerRequestAssignments } from "@/lib/installation/installer/review";
import { listDispatchCandidateInstallers } from "@/lib/installation/installer/source";
import { findBestMatchingInstallers } from "@/lib/installation/installer/matcher";
import {
  countInstallationOrderStatuses,
  listInstallationOrderStatuses,
} from "@/lib/installation/orders/views/orders";
import { getInstallationOrderStatusDetail } from "@/lib/installation/orders/views/detail";
import { parseRequiredCapabilitiesText } from "@/lib/installation/orders/source/source-items";
import {
  fetchResolvedInstallationOrdersFromErp,
  getTodayKstOrderDate,
} from "@/lib/installation/orders/source/fetch/service";
import {
  annotateFetchedInstallationOrderValidation,
  saveFetchedInstallationOrders,
} from "@/lib/installation/orders/source/persistence";

const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/backoffice/installations",
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/login/backofficeAuth", () => ({
  getCurrentBackofficeUser: vi.fn(),
  requireBackofficeUserPage: vi.fn(),
}));

vi.mock("@/lib/backoffice/dashboard", () => ({
  getBackofficeDashboardChartSummary: vi.fn(),
  getBackofficeSystemStatusSummary: vi.fn(),
}));

vi.mock("@/lib/installation/installer/matcher", () => ({
  findBestMatchingInstallers: vi.fn((address: string, installers: Array<{ serviceAreas?: string[] }> = []) =>
    installers.filter((installer) =>
      installer.serviceAreas?.some((area: string) => address.includes(area)),
    ),
  ),
}));

vi.mock("@/lib/installation/installer/review", () => ({
  listActiveInstallerRequestAssignments: vi.fn(),
}));

vi.mock("@/lib/installation/installer/source", () => ({
  listDispatchCandidateInstallers: vi.fn(),
}));

vi.mock("@/lib/installation/orders/views/orders", () => ({
  countInstallationOrderStatuses: vi.fn(),
  listInstallationOrderStatuses: vi.fn(),
}));

vi.mock("@/lib/installation/orders/views/detail", () => ({
  getInstallationOrderStatusDetail: vi.fn(),
}));

vi.mock("@/lib/installation/orders/source/source-items", () => ({
  parseRequiredCapabilitiesText: vi.fn((value: string | null | undefined) => {
    if (!value?.trim()) return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }),
}));

vi.mock("@/lib/installation/orders/source/persistence", () => ({
  annotateFetchedInstallationOrderValidation: vi.fn((order) => {
    if (order.phone === "032-123-4567") {
      return {
        ...order,
        memo: `${order.memo} / PHONE_11_DIGITS_REQUIRED`,
        source_error_code: "PHONE_11_DIGITS_REQUIRED",
      };
    }

    return {
      ...order,
      source_error_code: null,
    };
  }),
  saveFetchedInstallationOrders: vi.fn(),
}));

vi.mock("@/lib/installation/orders/source/fetch/service", () => ({
  fetchResolvedInstallationOrdersFromErp: vi.fn(),
  getTodayKstOrderDate: vi.fn(() => "20260616"),
}));

vi.mock("./installations/actions", () => ({
  cancelInstallationOrderAction: vi.fn(),
  completeInstallationOrderAction: vi.fn(),
  createManualInstallationAssignmentAction: vi.fn(),
  retryInstallationOrderAssignmentByAdminAction: vi.fn(),
  switchInstallationOrderToManualRequiredAction: vi.fn(),
}));

const backofficeDir = join(process.cwd(), "src", "app", "backoffice");
const loginDir = join(process.cwd(), "src", "app", "login");
const routesDir = join(backofficeDir, "installations");
const searchRoutesDir = join(backofficeDir, "installation-search");
const installationOrderSourceTablePath = join(
  backofficeDir,
  "installation-order-source",
  "InstallationOrderSourceTable.tsx",
);
const installationOrderSourceColumnsPath = join(
  backofficeDir,
  "installation-order-source",
  "InstallationOrderSourceTable.columns.tsx",
);
const legacyRoutesDir = join(backofficeDir, "installation-orders");
const legacyAuthDir = join(backofficeDir, "auth");

function getRenderedText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getRenderedText).join("");
  if (isValidElement(node)) {
    return getRenderedText((node.props as { children?: unknown }).children);
  }
  return "";
}

async function renderServerElement(element: unknown) {
  expect(isValidElement(element)).toBe(true);
  if (!isValidElement(element)) return null;

  return (element.type as (props: unknown) => Promise<unknown>)(element.props);
}

function createInstallationOrderDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    sourceErpOrderNo: "ORDER-001",
    sourceCustomerName: "홍길동",
    sourcePhone: "01012345678",
    sourceAddress: "서울 강남구 테헤란로 1",
    sourceExternalOrderNumbers: null,
    sourceNoGirl: null,
    sourceOrderDate: "20260616",
    sourceMemo: "스마트 도어락 K100 x1",
    sourceItemsJsonText: '[{"item_code":"K100","item_name":"스마트 도어락 K100","quantity":1}]',
    requiredCapabilities: "DOORLOCK",
    requiredAqaraAppCapability: "DOORLOCK_AND_APP",
    status: "READY_FOR_CANDIDATE_SELECTION" as const,
    activeCustomerRequestId: "request-1",
    activeAssignmentId: null,
    currentInstallerId: null,
    currentInstaller: null,
    hasOpenIssue: true,
    lastIssueId: null,
    statusChangedAt: new Date("2026-06-16T00:00:00.000Z"),
    customerRequests: [
      {
        id: "request-1",
        installAddress: "서울 강남구 테헤란로 1",
        installAddressDetail: "101호",
        installDate: "2026-06-20",
        installTimeSlot: null,
        customerPhone: "01012345678",
        customerNote: null,
        fallbackUsed: false,
        status: "SUBMITTED" as const,
        createdAt: new Date("2026-06-16T00:00:00.000Z"),
        updatedAt: new Date("2026-06-16T00:00:00.000Z"),
      },
    ],
    assignmentAttempts: [],
    statusEvents: [],
    candidateRuns: [],
    issues: [],
    notifications: [],
    ...overrides,
  };
}

describe("backoffice installation order routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockClear();
    vi.mocked(countInstallationOrderStatuses).mockResolvedValue(0);
    vi.mocked(getBackofficeDashboardChartSummary).mockResolvedValue({
      window: {
        days: 14,
        from: "2026-06-11",
        to: "2026-06-24",
        label: "최근 14일",
      },
      dailyTrend: [
        {
          date: "2026-06-24",
          label: "6/24",
          createdOrders: 12,
          completedOrders: 3,
        },
      ],
      queueStatusItems: [
        { key: "customerInputSmsRequired", label: "고객 문자 발송 필요", count: 13 },
        { key: "waitingCustomerInput", label: "고객 입력 대기", count: 4 },
        { key: "readyToAssign", label: "후보 선정 가능", count: 3 },
        { key: "waitingAdminReview", label: "관리자 검토 대기", count: 0 },
        { key: "waitingInstallerResponse", label: "기사 응답 대기", count: 0 },
      ],
      attentionCount: 0,
    });
    vi.mocked(getBackofficeSystemStatusSummary).mockResolvedValue({
      cronJobs: [],
    });
  });

  it("exposes the consolidated installation order routes", () => {
    expect(existsSync(join(routesDir, "page.tsx"))).toBe(true);
    expect(existsSync(join(routesDir, "[installationId]", "page.tsx"))).toBe(true);
    expect(existsSync(join(searchRoutesDir, "page.tsx"))).toBe(true);
    expect(existsSync(join(searchRoutesDir, "[installationId]", "page.tsx"))).toBe(true);
    expect(existsSync(legacyRoutesDir)).toBe(false);
  });

  it("opens installation details in a non-modal master-detail panel from both lists", () => {
    const detailSlotDir = join(backofficeDir, "@detail");
    const layoutSource = readFileSync(join(backofficeDir, "layout.tsx"), "utf8");
    const panelSource = readFileSync(join(backofficeDir, "InstallationOrderDetailPanel.tsx"), "utf8");
    const catchAllSource = readFileSync(join(detailSlotDir, "[...catchAll]", "page.tsx"), "utf8");

    expect(existsSync(join(detailSlotDir, "default.tsx"))).toBe(true);
    expect(existsSync(join(detailSlotDir, "[...catchAll]", "page.tsx"))).toBe(true);
    expect(existsSync(join(detailSlotDir, "(.)installations", "[installationId]", "page.tsx"))).toBe(true);
    expect(existsSync(join(detailSlotDir, "(.)installation-search", "[installationId]", "page.tsx"))).toBe(true);
    expect(layoutSource).toContain("detail: ReactNode");
    expect(layoutSource).toContain("{detail}");
    expect(layoutSource).toContain('className="flex min-w-0 flex-1 overflow-hidden md:min-h-0"');
    expect(panelSource).toContain('aria-label="설치 주문 상세"');
    expect(panelSource).toContain("lg:w-1/2");
    expect(panelSource).not.toContain("lg:w-[72%]");
    expect(panelSource).not.toContain("fixed inset-0");
    expect(panelSource).not.toContain("bg-black/");
    expect(catchAllSource).toContain("return null");
  });

  it("keeps the desktop sidebar fixed while only the main content scrolls", () => {
    const layoutSource = readFileSync(join(backofficeDir, "layout.tsx"), "utf8");

    expect(layoutSource).toContain("md:h-screen md:overflow-hidden");
    expect(layoutSource).toContain("md:h-full md:min-h-0 md:flex-row");
    expect(layoutSource).toContain("md:overflow-y-auto");
  });

  it("exposes login as the canonical backoffice authentication route", () => {
    expect(existsSync(join(loginDir, "page.tsx"))).toBe(true);
    expect(existsSync(join(loginDir, "BackofficeAuthClient.tsx"))).toBe(true);
    expect(existsSync(legacyAuthDir)).toBe(false);
  });

  it("shows the logged-in email and logout control in the backoffice sidebar", () => {
    const layoutSource = readFileSync(join(backofficeDir, "layout.tsx"), "utf8");
    const desktopSidebarSource = readFileSync(join(backofficeDir, "BackofficeDesktopSidebar.tsx"), "utf8");
    const userMenuSource = readFileSync(join(backofficeDir, "BackofficeUserMenu.tsx"), "utf8");

    expect(layoutSource).toContain("getCurrentBackofficeUser");
    expect(layoutSource).toContain("<BackofficeDesktopSidebar userEmail={user?.email} />");
    expect(desktopSidebarSource).toContain("<BackofficeUserMenu email={userEmail} iconOnly={collapsed} openUpward />");
    expect(userMenuSource).toContain('aria-label={`${email} 계정 메뉴`}');
    expect(userMenuSource).toContain("signOutBackofficeAction()");
    expect(userMenuSource).not.toContain("/api/login/logout");
    expect(userMenuSource).toContain('window.location.assign("/")');
  });

  it("links the backoffice sidebar title to the backoffice root", () => {
    const desktopSidebarSource = readFileSync(join(backofficeDir, "BackofficeDesktopSidebar.tsx"), "utf8");

    expect(desktopSidebarSource).toContain('import Link from "next/link"');
    expect(desktopSidebarSource).toContain('href="/backoffice"');
    expect(desktopSidebarSource).toMatch(/<Link[\s\S]*href="\/backoffice"[\s\S]*Backoffice[\s\S]*<\/Link>/);
  });

  it("shows the ERP installation order source menu in the backoffice sidebar", () => {
    const sidebarSource = readFileSync(join(backofficeDir, "BackofficeSidebarNav.tsx"), "utf8");

    expect(sidebarSource).toContain('href: "/backoffice/installation-order-source"');
    expect(sidebarSource).toContain('label: "ERP 주문 데이터"');
  });

  it("shows separate sidebar entries for the installation queue and order search", () => {
    const sidebarSource = readFileSync(join(backofficeDir, "BackofficeSidebarNav.tsx"), "utf8");

    expect(sidebarSource).toContain('href: "/backoffice/installations?statusView=active"');
    expect(sidebarSource).toContain('label: "설치 업무 큐"');
    expect(sidebarSource).toContain('href: "/backoffice/installation-search"');
    expect(sidebarSource).toContain('label: "주문 검색"');
    expect(sidebarSource).not.toContain('label: "설치 주문 관리"');
  });

  it("shows a selected state for the active backoffice sidebar menu item", () => {
    const layoutSource = readFileSync(join(backofficeDir, "layout.tsx"), "utf8");
    const desktopSidebarSource = readFileSync(join(backofficeDir, "BackofficeDesktopSidebar.tsx"), "utf8");
    const sidebarSource = readFileSync(join(backofficeDir, "BackofficeSidebarNav.tsx"), "utf8");

    expect(layoutSource).toContain("<BackofficeDesktopSidebar");
    expect(desktopSidebarSource).toContain("<BackofficeSidebarNav");
    expect(sidebarSource).toContain("usePathname");
    expect(sidebarSource).toContain("aria-current");
    expect(sidebarSource).toContain("bg-white font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200");
    expect(sidebarSource).not.toContain("bg-zinc-950 text-white");
    expect(sidebarSource).not.toContain("function MenuIcon");
    expect(sidebarSource).toContain("const menuItems: MenuItem[]");
    expect(sidebarSource).not.toContain("menuSections");
  });

  it("does not expose the installer list in the backoffice menu", () => {
    const layoutSource = readFileSync(join(backofficeDir, "layout.tsx"), "utf8");
    const backofficePageSource = readFileSync(join(backofficeDir, "page.tsx"), "utf8");

    expect(existsSync(join(backofficeDir, "installers"))).toBe(false);
    expect(layoutSource).not.toContain('href: "/backoffice/installers"');
    expect(layoutSource).not.toContain('label: "기사 리스트"');
    expect(backofficePageSource).not.toContain('href="/backoffice/installers"');
    expect(backofficePageSource).not.toContain("기사 리스트");
  });

  it("does not keep mock or raw query handling in backoffice page implementations", () => {
    const sourcePaths = [
      join(backofficeDir, "installation-order-source", "page.tsx"),
      join(backofficeDir, "installation-order-source", "InstallationOrderSourceTable.tsx"),
      join(routesDir, "page.tsx"),
      join(routesDir, "InstallationOrderList.tsx"),
      join(routesDir, "[installationId]", "page.tsx"),
    ];

    const combinedSource = sourcePaths.map((path) => readFileSync(path, "utf8")).join("\n");

    expect(combinedSource).not.toContain("mock=true");
    expect(combinedSource).not.toContain("resolvedSearchParams.mock");
    expect(combinedSource).not.toContain("resolvedSearchParams.raw");
    expect(combinedSource).not.toContain("rawResponseData");
    expect(combinedSource).not.toContain("renderRawDataSection");
    expect(combinedSource).not.toContain("loadMockFetchedInstallationOrders");
    expect(combinedSource).not.toContain("loadMockBackofficeInstallers");
    expect(combinedSource).not.toContain("getMockInstallationOrderItems");
    expect(combinedSource).not.toContain("getMockAssignmentReviewItems");
    expect(combinedSource).not.toContain("getMockInstallationOrderDetailItem");
  });

  it("keeps the JSON entity browser page under settings", () => {
    expect(existsSync(join(backofficeDir, "settings", "json-entities"))).toBe(true);
  });

  it("does not show JSON entity category labels above entity titles", () => {
    const browserSource = readFileSync(
      join(backofficeDir, "settings", "json-entities", "JsonEntityBrowser.tsx"),
      "utf8",
    );

    expect(browserSource).not.toContain("{entity.category}");
    expect(browserSource).not.toContain("{selectedEntity.category}");
  });

  it("keeps the SMS template page content while removing the rendered preview section", () => {
    const smsTemplatePageDir = join(backofficeDir, "settings", "sms-templates");
    const pageSource = readFileSync(join(smsTemplatePageDir, "page.tsx"), "utf8");
    const clientSource = readFileSync(join(smsTemplatePageDir, "SmsTemplateClient.tsx"), "utf8");

    expect(existsSync(join(smsTemplatePageDir, "SmsTemplatePreviewClient.tsx"))).toBe(false);
    expect(existsSync(join(smsTemplatePageDir, "SmsTemplateClient.tsx"))).toBe(true);
    expect(pageSource).toContain("getInstallationSmsTemplatePreviews");
    expect(pageSource).toContain("<SmsTemplateClient templates={templates} />");
    expect(pageSource).not.toContain("SmsTemplatePreviewClient");
    expect(pageSource).toContain('<BackofficePageHeader title="SMS 템플릿" />');
    expect(clientSource).toContain("템플릿 본문");
    expect(clientSource).not.toContain("변수 적용 미리보기");
    expect(clientSource).not.toContain("sampleVars");
  });

  it("shows an in-page loading animation while ERP installation orders load", () => {
    const loadingSource = readFileSync(join(backofficeDir, "installation-order-source", "loading.tsx"), "utf8");

    expect(loadingSource).toContain("ERP 주문 데이터");
    expect(loadingSource).toContain("ERP_SOURCE_LOADING_COLUMN_COUNT");
    expect(loadingSource).toContain("ERP_SOURCE_LOADING_COLUMNS.length");
    expect(loadingSource).toContain('aria-label="컬럼 헤더 로딩 중"');
    expect(loadingSource).not.toContain('"customer_name"');
    expect(loadingSource).not.toContain('"order_numbers"');
    expect(loadingSource).not.toContain('"ERP 주문"');
    expect(loadingSource).not.toContain('"주문일"');
    expect(loadingSource).not.toContain("데이터를 불러오는 중입니다.");
    expect(loadingSource).toContain("animate-spin");
    expect(loadingSource).toContain("flex items-center gap-2");
    expect(loadingSource).not.toContain("justify-between");
  });

  it("supports a lazy query parameter for visually checking the installation management loading state", () => {
    const pageSource = readFileSync(join(routesDir, "page.tsx"), "utf8");
    const loadingSource = readFileSync(join(routesDir, "loading.tsx"), "utf8");

    expect(pageSource).toContain('resolvedSearchParams.lazy === "true"');
    expect(pageSource).toContain("await sleep(5_000)");
    expect(pageSource).toContain("function sleep");
    expect(loadingSource).toContain("설치 주문");
    expect(loadingSource).toContain("진행 중");
    expect(loadingSource).toContain("INSTALLATION_ORDER_LOADING_COLUMNS");
    expect(loadingSource).toContain('aria-label="컬럼 헤더 로딩 중"');
    expect(loadingSource).toContain("animate-spin");
    expect(loadingSource).toContain('aria-label="설치 주문 로딩 중"');
    expect(loadingSource).not.toContain("배정 요청");
  });

  it("shows the ERP installation order item count below the table", () => {
    const tableSource = readFileSync(installationOrderSourceTablePath, "utf8");
    const pageSource = readFileSync(join(backofficeDir, "installation-order-source", "page.tsx"), "utf8");

    expect(tableSource).toContain("{initialItems.length}건");
    expect(tableSource).toContain("<BackofficePageHeader");
    expect(tableSource).toContain('title="ERP 주문 데이터"');
    expect(tableSource).not.toContain("meta={`${initialItems.length}건`}");
    expect(tableSource).toContain('className="mt-3 text-sm font-medium text-zinc-500"');
    expect(tableSource.indexOf("{initialItems.length}건")).toBeGreaterThan(
      tableSource.indexOf("<BackofficeDataTable"),
    );
    expect(tableSource).not.toContain("<p className=\"mt-1 text-sm text-zinc-500\">");
    expect(tableSource).not.toContain("ERP 원천 조회 결과");
    expect(tableSource).not.toContain("조회 시각");
    expect(tableSource).not.toContain("fetchedAt");
    expect(pageSource).not.toContain("fetchedAt=");
  });

  it("keeps the ERP installation order title in the page header and filters above the table", () => {
    const tableSource = readFileSync(installationOrderSourceTablePath, "utf8");
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(tableSource).toContain("<BackofficePageHeader");
    expect(tableSource).toContain("renderBeforeTable=");
    expect(dataTableSource).toContain("renderBeforeTable?.(columnControls)");
    expect(tableSource.indexOf("ERP 주문 데이터")).toBeLessThan(tableSource.indexOf("renderBeforeTable="));
    expect(tableSource.indexOf("납기일자 시작")).toBeGreaterThan(tableSource.indexOf("renderBeforeTable="));
    expect(tableSource.indexOf("{columnControls}")).toBeGreaterThan(tableSource.indexOf("조회"));
    expect(tableSource).not.toContain("toolbarLeading=");
  });

  it("uses a fresh table preference key for the dispatch source columns", () => {
    const tableSource = readFileSync(installationOrderSourceTablePath, "utf8");

    expect(tableSource).toContain('const TABLE_PREFS_KEY = "backoffice.installation-order-source.table.v3"');
    expect(tableSource).not.toContain("backoffice.installation-order-source.table.v2");
    expect(tableSource).not.toContain("backoffice.installation-order-source.table.v1");
  });

  it("shows operational identifiers as separate ERP installation order data columns", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");

    expect(tableSource).toContain('accessorKey: "customer_name"');
    expect(tableSource).toContain('header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.customer_name');
    expect(tableSource).toContain('header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.phone');
    expect(tableSource).toContain('header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.order_numbers');
    expect(tableSource).toContain('header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.no_girl');
    expect(tableSource).toContain('customer_name: "고객명"');
    expect(tableSource).toContain('phone: "연락처"');
    expect(tableSource).toContain('address: "주소"');
    expect(tableSource).toContain('due_date: "납기일자"');
    expect(tableSource).toContain('order_numbers: "주문번호"');
    expect(tableSource).toContain('no_girl: "출고번호"');
    expect(tableSource).toContain('memo: "메모"');
    expect(tableSource).not.toContain('header: "source_key"');
    expect(tableSource).not.toContain('header: "에러 코드"');
    expect(tableSource).not.toContain("외부/출고 번호");
    expect(tableSource).toContain("formatBackofficePhone(row.original.phone)");

    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");
    expect(dataTableSource).toContain("colSpan={table.getVisibleLeafColumns().length}");
    expect(dataTableSource).toContain("sticky left-0");
    expect(dataTableSource).toContain("w-[calc(100vw-2rem)]");
  });

  it("orders ERP installation order data columns by operational scanning priority", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");
    const headerOrder = [
      "due_date",
      "order_numbers",
      "no_girl",
      "customer_name",
      "phone",
      "address",
      "memo",
    ];

    const headerIndexes = headerOrder.map((header) => tableSource.indexOf(`accessorKey: "${header}"`));

    expect(headerIndexes.every((index) => index >= 0)).toBe(true);
    expect(headerIndexes).toEqual([...headerIndexes].sort((a, b) => a - b));
  });

  it("uses TanStack table sorting for ERP installation order data columns", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");
    const componentSource = readFileSync(installationOrderSourceTablePath, "utf8");
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(tableSource).toContain("@tanstack/react-table");
    expect(componentSource).toContain("BackofficeDataTable");
    expect(dataTableSource).toContain("useReactTable");
    expect(dataTableSource).toContain("getSortedRowModel");
    expect(dataTableSource).toContain("toggleSorting");
    expect(dataTableSource).toContain("aria-sort");
  });

  it("keeps the default table sorting reference stable across renders", () => {
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(dataTableSource).toContain("const DEFAULT_SORTING_STATE: SortingState = []");
    expect(dataTableSource).toContain("defaultSorting = DEFAULT_SORTING_STATE");
    expect(dataTableSource).not.toContain("defaultSorting = []");
  });

  it("places the installation order search area below the title with description at the bottom", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).not.toContain("InstallationOrderConditionSummary");
    expect(listSource).not.toContain("조회 조건");
    expect(listSource).toContain("InstallationOrderInlineSearchForm");
    expect(listSource).not.toContain('aria-label="검색 조건 열기"');
    expect(listSource).toContain('name="searchFrom"');
    expect(listSource).toContain('name="searchTo"');
    expect(listSource).toContain('name="searchField"');
    expect(listSource).toContain('name="searchKeyword"');
    expect(listSource).toContain("고객명과 고객전화번호는 정확히 일치해야 합니다.");
    expect(listSource.indexOf("<InstallationOrderInlineSearchForm")).toBeLessThan(
      listSource.indexOf("InstallationOrderStatusViewTabs"),
    );
  });

  it("keeps ERP installation order table scrollable while wrapping long address and memo cells", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");
    const componentSource = readFileSync(installationOrderSourceTablePath, "utf8");
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(dataTableSource).toContain("overflow-x-auto");
    expect(dataTableSource).toContain("whitespace-nowrap");
    expect(componentSource).toContain('cellClassName="align-top overflow-hidden px-4 py-3 text-zinc-700"');
    expect(tableSource).toContain("line-clamp-2 whitespace-normal break-keep");
    expect(tableSource).not.toContain("truncate");
  });

  it("does not render ERP source item payload as a separate installation order data column", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");

    expect(tableSource).not.toContain('header: "설치 품목"');
    expect(tableSource).not.toContain('header: "상품"');
    expect(tableSource).not.toContain("formatItemLine");
    expect(tableSource).not.toContain("formatSortableItems");
    expect(tableSource).not.toContain("row.original.items");
    expect(tableSource).not.toContain("row.original.item_code");
    expect(tableSource).not.toContain("row.original.item_name");
    expect(tableSource).not.toContain("row.original.quantity");
  });

  it("makes ERP installation order memo text readable for operational prefixes", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");

    expect(tableSource).toContain("font-medium");
    expect(tableSource).toContain("text-zinc-800");
    expect(tableSource).toContain("whitespace-normal");
    expect(tableSource).toContain("break-keep");
    expect(tableSource).not.toContain("text-xs leading-5 text-zinc-500");
  });

  it("provides column selection controls for ERP installation order data", () => {
    const tableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");

    expect(tableSource).not.toContain('header: "source_key"');
    expect(tableSource).toContain("enableHiding: false");

    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");
    expect(dataTableSource).toContain("VisibilityState");
    expect(dataTableSource).toContain("columnVisibility");
    expect(dataTableSource).toContain("onColumnVisibilityChange");
    expect(dataTableSource).toContain("getAllLeafColumns");
    expect(dataTableSource).toContain("getToggleVisibilityHandler");
    expect(dataTableSource).toContain("컬럼 보기");
    expect(dataTableSource).toContain("showColumnVisibilityPopup");
    expect(dataTableSource).toContain("컬럼 보기 설정");
    expect(dataTableSource).toContain('type="checkbox"');
  });

  it("keeps required table columns visible across backoffice tables", () => {
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");
    const sourceTableSource = readFileSync(installationOrderSourceColumnsPath, "utf8");
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");
    const reviewSource = readFileSync(join(routesDir, "AssignmentReviewList.tsx"), "utf8");

    expect(dataTableSource).toContain("getNonHideableColumnIds");
    expect(dataTableSource).toContain("sanitizeColumnVisibility");
    expect(dataTableSource).toContain("column.getCanHide()");
    expect(sourceTableSource.match(/enableHiding: false/g)?.length).toBeGreaterThanOrEqual(1);
    expect(listSource.match(/enableHiding: false/g)?.length).toBeGreaterThanOrEqual(5);
    expect(reviewSource.match(/enableHiding: false/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("provides shared column selection controls for backoffice tables", () => {
    const tableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(tableSource).toContain("VisibilityState");
    expect(tableSource).toContain("columnVisibility");
    expect(tableSource).toContain("onColumnVisibilityChange");
    expect(tableSource).toContain("getAllLeafColumns");
    expect(tableSource).toContain("getToggleVisibilityHandler");
    expect(tableSource).toContain("컬럼 보기");
    expect(tableSource).toContain("showColumnVisibilityPopup");
    expect(tableSource).toContain("컬럼 보기 설정");
    expect(tableSource).toContain('type="checkbox"');
  });

  it("uses a popup column order control instead of header dragging", () => {
    const tableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(tableSource).toContain("컬럼 순서");
    expect(tableSource).toContain("showColumnOrderPopup");
    expect(tableSource).toContain("moveColumnOrder");
    expect(tableSource).toContain("위로");
    expect(tableSource).toContain("아래로");
    expect(tableSource).not.toContain("draggable");
    expect(tableSource).not.toContain("onDragStart");
    expect(tableSource).not.toContain("onDragOver");
    expect(tableSource).not.toContain("onDrop");
    expect(tableSource).not.toContain("draggedColumnId");
    expect(tableSource).not.toContain("cursor-grab");
  });

  it("uses redirect_url as the backoffice login return parameter", () => {
    const authSource = readFileSync(
      join(process.cwd(), "src", "lib", "login", "backofficeAuth.ts"),
      "utf8",
    );

    expect(authSource).toContain("redirect(`/login?redirect_url=${encodeURIComponent(nextPath)}`)");
    expect(authSource).not.toContain("/login?next=");
  });

  it("uses the Supabase Auth SDK for backoffice email auth sessions", () => {
    const authSource = readFileSync(
      join(process.cwd(), "src", "lib", "login", "backofficeAuth.ts"),
      "utf8",
    );
    const actionsSource = readFileSync(
      join(process.cwd(), "src", "app", "login", "actions.ts"),
      "utf8",
    );
    const middlewareSource = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf8");

    expect(authSource).toContain('from "@supabase/ssr"');
    expect(authSource).toContain("signInWithPassword");
    expect(authSource).toContain("auth.getUser()");
    expect(authSource).not.toContain("createHmac");
    expect(authSource).not.toContain("BACKOFFICE_COOKIE_NAME");
    expect(actionsSource).toContain('"use server"');
    expect(actionsSource).toContain("signInBackofficeWithPassword");
    expect(actionsSource).toContain("changeBackofficePassword");
    expect(actionsSource).toContain("PASSWORD_CONFIRMATION_MISMATCH");
    expect(actionsSource).toContain("auth.signOut()");
    expect(actionsSource).toContain("cookieStore.set");
    expect(middlewareSource).toContain('matcher: ["/backoffice/:path*"]');
    expect(middlewareSource).toContain('Cache-Control", "private, no-store"');
  });

  it("renders the canonical installation board route", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "active" }),
    });
    const renderedView = await renderServerElement(element);

    expect(requireBackofficeUserPage).toHaveBeenCalledWith(
      "/backoffice/installations?statusView=active",
      1,
    );
    expect(renderedView).toMatchObject({
      props: {
        initialItems: [],
      },
    });
  });

  it("fetches ERP installation orders without storing them and renders fetched rows on page load", async () => {
    const fetchedOrders = [
      {
        source_key: "GIR-1",
        customer_name: "홍길동",
        phone: "010-1234-5678",
        address: "서울 강남구 테헤란로 1",
        order_numbers: "EXT-1",
        no_girl: "GIR-1",
        due_date: "20260615",
        memo: "K100도어락설치 x1",
      },
    ];
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockResolvedValue(fetchedOrders);

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({}),
    });

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice/installation-order-source", 1);
    expect(fetchResolvedInstallationOrdersFromErp).toHaveBeenCalled();
    expect(saveFetchedInstallationOrders).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        initialItems: expect.arrayContaining([
          expect.objectContaining({ source_key: "GIR-1" }),
        ]),
      },
    });
  });

  it("passes page due date filters to the ERP source fetch without storing fetched rows", async () => {
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockResolvedValue([]);

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({
        from: "2026-06-01",
        to: "2026-06-23",
      }),
    });

    expect(fetchResolvedInstallationOrdersFromErp).toHaveBeenCalledWith({
      from: "20260601",
      to: "20260623",
    });
    expect(saveFetchedInstallationOrders).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        from: "2026-06-01",
        to: "2026-06-23",
      },
    });
  });

  it("ignores the removed mock query parameter on the ERP source page", async () => {
    const fetchedOrders = [
      {
        source_key: "GIR-4",
        customer_name: "홍길동",
        phone: "010-1234-5678",
        address: "서울 강남구 테헤란로 1",
        order_numbers: "EXT-4",
        no_girl: "GIR-4",
        due_date: "20260616",
        memo: "K100도어락설치 x1",
      },
    ];
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockResolvedValue(fetchedOrders);

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({ mock: "true" }),
    });

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice/installation-order-source", 1);
    expect(fetchResolvedInstallationOrdersFromErp).toHaveBeenCalled();
    expect(saveFetchedInstallationOrders).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        initialItems: [
          expect.objectContaining({
            source_key: "GIR-4",
            source_error_code: null,
          }),
        ],
      },
    });
  });

  it("ignores the removed raw query parameter on the ERP source page", async () => {
    const fetchedOrders = [
      {
        source_key: "GIR-3",
        customer_name: "홍길동",
        phone: "010-1234-5678",
        address: "서울 강남구 테헤란로 1",
        order_numbers: "EXT-3",
        no_girl: "GIR-3",
        due_date: "20260615",
        memo: "K100도어락설치 x1",
      },
    ];
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockResolvedValue(fetchedOrders);

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({ raw: "true" }),
    });

    expect(fetchResolvedInstallationOrdersFromErp).toHaveBeenCalled();
    expect(saveFetchedInstallationOrders).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        initialItems: [
          expect.objectContaining({
            source_key: "GIR-3",
            order_numbers: "EXT-3",
          }),
        ],
      },
    });
    expect(element.props.rawResponseData).toBeUndefined();
  });

  it("does not render a raw ERP response section on the source table", () => {
    const tableSource = readFileSync(installationOrderSourceTablePath, "utf8");

    expect(tableSource).not.toContain("rawResponseData");
    expect(tableSource).not.toContain("JSON.stringify");
    expect(tableSource).not.toContain("응답 데이터");
  });

  it("does not report DB storage failures because page load does not store ERP installation orders", async () => {
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockResolvedValue([]);
    vi.mocked(saveFetchedInstallationOrders).mockRejectedValue(new Error("PHONE_11_DIGITS_REQUIRED"));

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({}),
    });

    expect(element).toMatchObject({
      props: {
        initialItems: [],
        errorMessage: undefined,
      },
    });
    expect(saveFetchedInstallationOrders).not.toHaveBeenCalled();
  });

  it("renders fetch errors and skips DB storage when ERP installation order fetch fails", async () => {
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockRejectedValue(new Error("ERP_CONNECTION_FAILED"));

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({}),
    });

    expect(saveFetchedInstallationOrders).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        initialItems: [],
        errorMessage: "ERP_CONNECTION_FAILED",
      },
    });
  });

  it("marks fetched rows with validation errors so the page can highlight them", async () => {
    vi.mocked(fetchResolvedInstallationOrdersFromErp).mockResolvedValue([
      {
        source_key: "GIR-2",
        customer_name: "홍길동",
        phone: "032-123-4567",
        address: "서울 강남구 테헤란로 1",
        order_numbers: "EXT-2",
        no_girl: "GIR-2",
        due_date: "20260615",
        memo: "K100도어락설치 x1",
      },
    ]);

    const element = await InstallationOrderSourcePage({
      searchParams: Promise.resolve({}),
    });

    expect(element).toMatchObject({
      props: {
        initialItems: [
          expect.objectContaining({
            source_error_code: "PHONE_11_DIGITS_REQUIRED",
            memo: "K100도어락설치 x1 / PHONE_11_DIGITS_REQUIRED",
          }),
        ],
      },
    });
  });

  it("renders ERP installation order validation errors with row background only", () => {
    const tableSource = readFileSync(installationOrderSourceTablePath, "utf8");
    const columnsSource = readFileSync(installationOrderSourceColumnsPath, "utf8");

    expect(tableSource).toContain("row.source_error_code");
    expect(tableSource).toContain("bg-rose-50");
    expect(tableSource).not.toContain("bg-rose-50 text-rose-700");
    expect(columnsSource).not.toContain("text-rose-700");
    expect(columnsSource).not.toContain('header: "에러 코드"');
  });

  it("renders the canonical installation detail route", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(getInstallationOrderStatusDetail).mockResolvedValue(createInstallationOrderDetail());
    vi.mocked(listDispatchCandidateInstallers).mockResolvedValue([]);
    const element = await InstallationDetailPage({
      params: Promise.resolve({ installationId: "1" }),
      searchParams: Promise.resolve({}),
    });

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice/installations/1", 1);
    expect(getInstallationOrderStatusDetail).toHaveBeenCalledWith("1");
    expect(element).toMatchObject({
      props: {
        item: expect.objectContaining({
          id: "1",
          sourceErpOrderNo: "ORDER-001",
        }),
      },
    });
  });

  it("resolves installer identity for installer SMS history", async () => {
    vi.mocked(getInstallationOrderStatusDetail).mockResolvedValue(
      createInstallationOrderDetail({
        assignmentAttempts: [
          {
            id: "assignment-1",
            installerId: "installer-1",
            installer: { name: "송지용", branch: "지용열쇠" },
            assignmentNumber: 1,
            assignmentSource: "AUTO",
            status: "WAITING_INSTALLER_RESPONSE",
            acceptedAt: null,
            rejectedAt: null,
            rejectReason: null,
            timedOutAt: null,
            createdAt: new Date("2026-07-16T05:14:57.000Z"),
          },
        ],
        notifications: [
          {
            id: "notification-1",
            smsType: "INSTALLER_AVAILABILITY_REQUEST",
            recipientType: "INSTALLER",
            recipientPhone: "01091703550",
            assignmentAttemptId: "assignment-1",
            status: "FAILED",
            providerStatus: null,
            providerStatusCode: null,
            providerReason: null,
            providerReportedAt: null,
            providerCheckedAt: null,
            errorCode: "4000",
            errorMessage: null,
            retryCount: 0,
            deliveryCheckCount: 1,
            sentAt: null,
            createdAt: new Date("2026-07-16T05:14:57.000Z"),
          },
        ],
      }),
    );
    vi.mocked(listDispatchCandidateInstallers).mockResolvedValue([]);

    const element = await InstallationDetailPage({
      params: Promise.resolve({ installationId: "1" }),
      searchParams: Promise.resolve({}),
    });

    expect(element).toMatchObject({
      props: {
        item: {
          smsNotifications: [
            expect.objectContaining({
              recipientName: "송지용",
              recipientBranch: "지용열쇠",
              recipientPhone: "01091703550",
            }),
          ],
        },
      },
    });
  });

  it("renders the search-context installation detail route", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(getInstallationOrderStatusDetail).mockResolvedValue(createInstallationOrderDetail());
    vi.mocked(listDispatchCandidateInstallers).mockResolvedValue([]);
    const element = await InstallationSearchDetailPage({
      params: Promise.resolve({ installationId: "1" }),
      searchParams: Promise.resolve({ searchField: "customerName", searchKeyword: "홍길동" }),
    });

    expect(requireBackofficeUserPage).toHaveBeenCalledWith(
      "/backoffice/installation-search/1?searchField=customerName&searchKeyword=%ED%99%8D%EA%B8%B8%EB%8F%99",
      1,
    );
    expect(getInstallationOrderStatusDetail).toHaveBeenCalledWith("1");
    expect(element).toMatchObject({
      props: {
        returnPath:
          "/backoffice/installation-search?searchField=customerName&searchKeyword=%ED%99%8D%EA%B8%B8%EB%8F%99",
        item: expect.objectContaining({
          id: "1",
          sourceErpOrderNo: "ORDER-001",
        }),
      },
    });
  });

  it("passes every active dispatch installer to the manual assignment selector", async () => {
    vi.mocked(getInstallationOrderStatusDetail).mockResolvedValue(createInstallationOrderDetail());
    vi.mocked(listDispatchCandidateInstallers).mockResolvedValue([
      {
        businessNumber: "installer-1",
        branchName: "강남/열쇠닥터",
        phone: "01012345678",
        installationRegion: "서울",
        possibleRegion: "강남구",
        impossibleRegion: "",
        serviceAreas: ["강남구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        hasAqaraHubInventory: true,
        monthlyDispatchCount: 3,
        lastRequestedAt: null,
        active: true,
      },
      {
        businessNumber: "installer-2",
        branchName: "부산/열쇠특공대",
        phone: "01087654321",
        installationRegion: "부산",
        possibleRegion: "부산",
        impossibleRegion: "",
        serviceAreas: ["부산"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        hasAqaraHubInventory: false,
        monthlyDispatchCount: 1,
        lastRequestedAt: null,
        active: true,
      },
    ]);

    const element = await InstallationDetailPage({
      params: Promise.resolve({ installationId: "1" }),
      searchParams: Promise.resolve({}),
    });

    expect(element).toMatchObject({
      props: {
        item: expect.objectContaining({
          installerCandidates: [expect.objectContaining({ installerId: "installer-1" })],
          manualAssignmentInstallers: [
            expect.objectContaining({ installerId: "installer-1" }),
            expect.objectContaining({ installerId: "installer-2" }),
          ],
        }),
      },
    });
  });

  it("uses intent-based component names", () => {
    const listFiles = readdirSync(routesDir);
    const detailFiles = readdirSync(join(routesDir, "[installationId]"));

    expect(listFiles).toContain("InstallationOrderList.tsx");
    expect(listFiles).toContain("AssignmentReviewList.tsx");
    expect(detailFiles).toContain("InstallationOrderDetail.tsx");
    expect([...listFiles, ...detailFiles].some((file) => file.includes("Workflow"))).toBe(false);
  });

  it("shows the stored ERP source memo in the installation order list", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).not.toContain('header: "주문-상품정보"');
    expect(listSource).toContain('header: "주문-메모"');
    expect(listSource).toContain('id: "sourceMemo"');
    expect(listSource).toContain("row.original.productSummary");
    expect(listSource).not.toContain("formatSourceItems(row.original.sourceItemsJsonText, row.original.itemName)");
    expect(listSource).not.toContain("ERP 품목:");
  });

  it("shows installation order detail affordances in the list", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain("font-semibold text-blue-700 underline");
    expect(listSource).not.toContain('header: "상세"');
    expect(listSource).not.toContain("주문 상세 보기");
    expect(listSource).not.toContain('<span aria-hidden="true">→</span>');
  });

  it("maps list aliases from the spec contract", () => {
    const viewSource = readFileSync(join(routesDir, "views.tsx"), "utf8");
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(viewSource).toContain("installationId: order.id");
    expect(viewSource).toContain("itemName: null");
    expect(viewSource).toContain("productSummary: order.sourceMemo");
    expect(viewSource).toContain("sourceItemsJsonText: order.sourceItemsJsonText");
    expect(viewSource).toContain("activeAttempt:");
    expect(viewSource).toContain("customerRequest:");
    expect(listSource).toContain("installationId: string");
    expect(listSource).toContain("productSummary: string | null");
    expect(listSource).toContain("sourceItemsJsonText: string | null");
    expect(listSource).not.toContain("row.original.sourceItemsJsonText");
  });

  it("does not show the current page item count next to the installation order list title", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");
    const loadingSource = readFileSync(join(routesDir, "loading.tsx"), "utf8");

    expect(listSource).toContain("<BackofficePageHeader");
    expect(listSource).toContain("title={title}");
    expect(listSource).not.toContain("meta={`${initialItems.length}건`}");
    expect(listSource).not.toContain("{initialItems.length}건");
    expect(listSource).not.toContain("전체 {initialItems.length}건 / 표시");
    expect(loadingSource).not.toContain("<span className=\"text-sm text-zinc-500\">-건</span>");
  });

  it("keeps only active workflow statuses as filters inside the installation queue page", () => {
    const pageSource = readFileSync(join(routesDir, "page.tsx"), "utf8");
    const sidebarSource = readFileSync(join(backofficeDir, "BackofficeSidebarNav.tsx"), "utf8");

    expect(sidebarSource).toContain('label: "설치 업무 큐"');
    expect(sidebarSource).toContain('label: "주문 검색"');
    expect(sidebarSource).not.toContain('href: "/backoffice/installation-history"');
    expect(sidebarSource).not.toContain('href: "/backoffice/installation-assignment-requests"');
    expect(pageSource).toContain('title="설치 업무 큐"');
    expect(pageSource).toContain("showSearchControls={false}");
    expect(pageSource).toContain('label: "전체 진행 중"');
    expect(pageSource).toContain('label: "처리 필요/예외"');
    expect(pageSource).toContain('label: "고객 문자 발송 필요"');
    expect(pageSource).toContain('label: "예외 이슈"');
    expect(pageSource).toContain('statusView: "attentionAdminReview"');
    expect(pageSource).toContain('statusView === "attentionAdminReview"');
    expect(pageSource).toContain('label: "고객 입력 대기"');
    expect(pageSource).toContain('label: "기사 배정 전"');
    expect(pageSource).toContain('label: "배정 승인 대기"');
    expect(pageSource).toContain('label: "기사 응답 대기"');
    expect(pageSource).toContain('label: "기사 배정 완료"');
    expect(pageSource).not.toContain('label: "전체"');
    expect(pageSource).not.toContain('label: "설치 완료"');
    expect(pageSource).not.toContain('label: "취소"');
  });

  it("keeps the installation order loading state on the current list UI", () => {
    const loadingSource = readFileSync(join(routesDir, "loading.tsx"), "utf8");

    expect(loadingSource).toContain("설치 업무 큐");
    expect(loadingSource).toContain("전체 진행 중");
    expect(loadingSource).toContain("INSTALLATION_ORDER_LOADING_COLUMNS");
    expect(loadingSource).toContain('aria-label="컬럼 헤더 로딩 중"');
    expect(loadingSource).toContain("w-max min-w-full");
    expect(loadingSource).not.toContain("고객 입력 대기");
    expect(loadingSource).not.toContain("배정 승인 대기");
    expect(loadingSource).not.toContain("기사 배정 완료");
    expect(loadingSource).not.toContain("-건");
    expect(loadingSource).not.toContain("진행 단계");
    expect(loadingSource).not.toContain("배정 요청");
    expect(loadingSource).not.toContain("border-b-2 border-zinc-950");
  });

  it("removes separate board filter and sort controls from the installation order list", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).not.toContain("issueFilter");
    expect(listSource).not.toContain("sortKey");
    expect(listSource).not.toContain("handleStatusChange");
    expect(listSource).not.toContain("handleIssueFilterChange");
    expect(listSource).not.toContain("handleSortKeyChange");
    expect(listSource).not.toContain("ERP 주문번호, 제품, 기사 ID 검색");
  });

  it("uses TanStack table header sorting on the installation order list", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(listSource).toContain("@tanstack/react-table");
    expect(listSource).toContain("BackofficeDataTable");
    expect(dataTableSource).toContain("useReactTable");
    expect(dataTableSource).toContain("getSortedRowModel");
    expect(dataTableSource).toContain("toggleSorting");
    expect(dataTableSource).toContain("aria-sort");
  });

  it("provides installation order table column visibility controls", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(dataTableSource).toContain("type VisibilityState");
    expect(dataTableSource).toContain("columnVisibility");
    expect(dataTableSource).toContain("onColumnVisibilityChange");
    expect(dataTableSource).toContain("getVisibleLeafColumns()");
    expect(dataTableSource).toContain("컬럼 보기");
    expect(dataTableSource).toContain("컬럼 보기 설정");
    expect(dataTableSource).toContain("getCanHide()");
    expect(dataTableSource).toContain("getToggleVisibilityHandler()");
    expect(dataTableSource).toContain("renderBeforeTable?.(columnControls)");
    expect(listSource).toContain("renderBeforeTable=");
    expect(listSource).toContain("{columnControls}");
    expect(listSource).not.toContain('className="mb-3 flex justify-end"');
    expect(listSource.indexOf("<InstallationOrderInlineSearchForm")).toBeLessThan(
      listSource.indexOf("InstallationOrderStatusViewTabs"),
    );
    expect(dataTableSource.indexOf("컬럼 보기")).toBeLessThan(
      dataTableSource.indexOf('className="overflow-hidden rounded-md border border-zinc-200 bg-white"'),
    );
  });

  it("keeps installation order table rows on a single line", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");
    const dataTableSource = readFileSync(join(backofficeDir, "BackofficeDataTable.tsx"), "utf8");

    expect(dataTableSource).toContain("whitespace-nowrap");
    expect(dataTableSource).toContain('className={`overflow-hidden ${cellClassName}`}');
    expect(listSource).toContain('className="truncate leading-5 text-zinc-800"');
    expect(listSource).toContain("title={formatText(getInstallationOrderAddress(row.original))}");
    expect(listSource).toContain('cellClassName="align-top px-4 py-3 text-zinc-600"');
    expect(listSource).not.toContain("whitespace-normal");
    expect(listSource).not.toContain("break-keep");
  });

  it("keeps installation order keyword search in the query string", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain('method="get"');
    expect(listSource).toContain('name="searchField"');
    expect(listSource).toContain('name="searchKeyword"');
    expect(listSource).toContain('const initialSelectedField = searchCondition?.field ?? "orderDate"');
    expect(listSource).toContain('value={dateRange.from}');
    expect(listSource).toContain('value={dateRange.to}');
    expect(listSource).toContain("정확히 일치");
    expect(listSource).toContain("ERP 주문번호");
    expect(listSource).toContain("외부 주문번호");
    expect(listSource).toContain("NO_GIRL");
    expect(listSource).toContain("홍길동");
    expect(listSource).toContain("01012345678");
    expect(listSource).toContain("ONS20260604942");
    expect(listSource).toContain("검색");
  });

  it("shows a clear search button that removes only the keyword query", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain("buildSearchResetHref");
    expect(listSource).toContain("searchCondition");
    expect(listSource).toContain("return buildStatusViewHref(basePath, statusView, { searchQuery: \"\", pageSize });");
    expect(listSource).toContain("초기화");
  });

  it("uses deterministic Korean date formatting on the visible installation date", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain("formatBackofficeDateTime(getInstallationOrderDate(row.original))");
    expect(listSource).not.toContain("toLocaleString(\"ko-KR\")");
  });

  it("shows only the recommended compact tracking columns without group headers", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain('header: "주문-주문번호"');
    expect(listSource).toContain('header: "주문-주문일"');
    expect(listSource).toContain('header: "주문-고객명"');
    expect(listSource).toContain('header: "주문-고객 전화"');
    expect(listSource).toContain('header: "주문-고객주소"');
    expect(listSource).toContain('header: "설치-주소"');
    expect(listSource).toContain('header: "설치-설치연락처"');
    expect(listSource).toContain('header: "설치-희망일"');
    expect(listSource).toContain('header: "배정-기사"');
    expect(listSource).toContain('header: "배정-상태"');
    expect(listSource).toContain('header: "운영-상태"');
    expect(listSource).toContain('header: "운영-처리 사유"');
    expect(listSource).toContain('header: "운영-다음 조치"');
    expect(listSource.match(/enableHiding: false/g)?.length).toBeGreaterThanOrEqual(2);
    expect(listSource).not.toContain("stickyColumnIds");
    expect(listSource).not.toContain('header: "상세"');
    expect(listSource).not.toContain('header: "주문 정보"');
    expect(listSource).not.toContain('header: "고객 입력"');
    expect(listSource).not.toContain('header: "운영 확인"');
    expect(listSource).not.toContain("header.subHeaders.length > 0");
    expect(listSource).not.toContain('header: "주문-상품정보"');
    expect(listSource).toContain('header: "주문-메모"');
    expect(listSource).not.toContain('header: "주문-주소"');
    expect(listSource).not.toContain('header: "설치-요청 상태"');
    expect(listSource).not.toContain('header: "배정"');
    expect(listSource).not.toContain('header: "배정-차수"');
    expect(listSource).not.toContain('header: "배정-유형"');
    expect(listSource).not.toContain('header: "배정-확정"');
    expect(listSource).not.toContain('header: "운영-예외"');
    expect(listSource).not.toContain('header: "운영-변경 시각"');
    expect(listSource).not.toContain('header: "긴급도"');
    expect(listSource).not.toContain('header: "희망일"');
    expect(listSource).not.toContain('header: "주소 출처"');
    expect(listSource).toContain("row.original.customerName");
    expect(listSource).toContain("row.original.sourceOrderDate");
    expect(listSource).toContain("row.original.phone");
    expect(listSource).toContain("row.original.sourceAddress");
    expect(listSource).toContain("getInstallationOrderAddress(row.original)");
    expect(listSource).toContain("row.original.request?.customerPhone");
    expect(listSource).toContain("row.original.activeAttempt?.assignmentStatus");
    expect(listSource).toContain("formatBackofficePhone(row.original.phone)");
    expect(listSource).toContain("formatBackofficePhone(row.original.request?.customerPhone)");
    expect(listSource).toContain('const TABLE_PREFS_KEY = "backoffice.installations.table.v3"');
  });

  it("keeps terminal status filters out of the installation queue while supporting result tracking columns", () => {
    const pageSource = readFileSync(join(routesDir, "page.tsx"), "utf8");
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(pageSource).not.toContain('{ statusView: "completed"');
    expect(pageSource).not.toContain('{ statusView: "cancelled"');
    expect(listSource).toContain('header: "처리일"');
    expect(listSource).toContain('header: "최종 기사"');
    expect(listSource).not.toContain('header: "처리-결과"');
    expect(listSource).not.toContain('header: "처리-변경 시각"');
    expect(listSource).not.toContain('header: "처리-최종 기사"');
  });

  it("highlights admin attention rows without a standalone urgency column", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain("getInstallationOrderDate(row.original)");
    expect(listSource).toContain("getRowClassName={(row) =>");
    expect(listSource).toContain("getInstallationOrderRowClassName(row)");
    expect(listSource).toContain("ring-2 ring-inset ring-blue-300");
    expect(listSource).toContain('row.status === "WAITING_CUSTOMER_INPUT"');
    expect(listSource).toContain("getAdminAttentionLabel");
    expect(listSource).toContain('return "희망일 확인 필요"');
    expect(listSource).toContain("if (row.hasOpenIssue)");
    expect(listSource).toContain("bg-rose-50");
    expect(listSource).toContain("bg-amber-50");
    expect(listSource).not.toContain("getUrgencyLabel");
    expect(listSource).not.toContain('header: "긴급도"');
    expect(listSource).not.toContain("formatText(row.original.request?.installDate ?? row.original.sourceOrderDate)");
  });

  it("shows customer and installer contact context on assignment requests", () => {
    const reviewSource = readFileSync(join(routesDir, "AssignmentReviewList.tsx"), "utf8");

    expect(reviewSource).toContain("BackofficeDataTable");
    expect(reviewSource).not.toContain("stickyColumnIds");
    expect(reviewSource).not.toContain("<table");
    expect(reviewSource).not.toContain('type="search"');
    expect(reviewSource).not.toContain("setQuery");
    expect(reviewSource).toContain("주문-고객명");
    expect(reviewSource).toContain("주문-고객 전화");
    expect(reviewSource).toContain("설치-주소");
    expect(reviewSource).toContain("기사-전화");
    expect(reviewSource).toContain("배정-출처");
    expect(reviewSource).toContain("배정-지역 매칭 단계");
    expect(reviewSource).toContain("배정-후보 순위");
    expect(reviewSource).not.toContain("선정 정보");
    expect(reviewSource).toContain("row.original.order.customerName");
    expect(reviewSource).toContain("row.original.order.sourcePhone");
    expect(reviewSource).toContain("row.original.request?.installAddress");
    expect(reviewSource).toContain("row.original.installerPhone");
    expect(reviewSource).toContain("formatBackofficeDateTime(row.original.createdAt)");
    expect(reviewSource).not.toContain("new Date(item.createdAt).toLocaleString(\"ko-KR\")");

    const dataTableSource = readFileSync(join(process.cwd(), "src", "app", "backoffice", "BackofficeDataTable.tsx"), "utf8");
    expect(dataTableSource).toContain("table-fixed");
    expect(dataTableSource).toContain("getTableWidth");
    expect(dataTableSource).toContain("getColumnSizeStyle");
    expect(dataTableSource).not.toContain("text-ellipsis");
    expect(dataTableSource).not.toContain("stickyColumnIds");
    expect(dataTableSource).not.toContain("sticky right-0");
    expect(dataTableSource).not.toContain("shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.45)]");
  });

  it("orders assignment review columns by order number, installer, installation, remaining order context, and operations", () => {
    const reviewSource = readFileSync(join(routesDir, "AssignmentReviewList.tsx"), "utf8");
    const expectedHeaders = [
      "주문-주문번호",
      "기사-기사명",
      "기사-ID",
      "기사-전화",
      "설치-희망일",
      "설치-희망시간",
      "설치-주소",
      "설치-고객 메모",
      "주문-고객명",
      "주문-고객 전화",
      "배정-출처",
      "배정-지역 매칭 단계",
      "배정-후보 순위",
      "운영-상태",
      "배정-후보 생성",
      "운영-액션",
    ];

    const headerIndexes = expectedHeaders.map((header) => reviewSource.indexOf(`header: "${header}"`));
    expect(headerIndexes.every((index) => index >= 0)).toBe(true);
    expect(headerIndexes).toEqual([...headerIndexes].sort((left, right) => left - right));
  });

  it("links installation orders to the current list detail route", () => {
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(listSource).toContain("detailSearchQuery");
    expect(listSource).toContain(
      'href={`${basePath}/${row.original.id}${detailSearchQuery ? `?${detailSearchQuery}` : ""}`}',
    );
  });

  it("shows read-only source order information on the detail page", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).not.toContain("label-installation-detail.json");
    expect(detailSource).not.toContain("detailTabLabels");
    expect(detailSource).not.toContain("detailSectionLabels");
    expect(detailSource).not.toContain("detailFieldLabels");
    expect(detailSource).toContain('{ key: "orderInfo", label: "주문 정보" }');
    expect(detailSource).toContain('Panel title="고객 정보"');
    expect(detailSource).toContain('Panel title="주소"');
    expect(detailSource).toContain('Panel title="상품 및 설치 요구"');
    expect(detailSource).toContain('Panel title="원본 주문 정보"');
    expect(detailSource).toContain("sourceOrderDate");
    expect(detailSource).toContain('label: "주문일"');
    expect(detailSource).toContain("parseSourceProductItems(item.sourceItemsJsonText)");
    expect(detailSource).toContain("SourceProductItems");
    expect(detailSource).not.toContain("formatText(item.sourceItemsJsonText)");
  });

  it("renders installation order detail status and grouped source order rows", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("KeyValueRows");
    expect(detailSource).toContain("KeyValueRow");
    expect(detailSource).toContain("grid-cols-[160px_minmax(0,1fr)]");
    expect(detailSource).not.toContain("orderStatusRows");
    expect(detailSource).toContain("customerInfoRows");
    expect(detailSource).toContain("addressRows");
    expect(detailSource).toContain("productRequirementRows");
    expect(detailSource).toContain("sourceOrderMetaRows");
    expect(detailSource).not.toContain("sourceOrderRows");
    expect(detailSource).not.toContain("detailSummaryRows");
    expect(detailSource).not.toContain("SummaryCard");
    expect(detailSource).not.toContain("ReadOnlyField");
  });

  it("renders type-grouped detail sections as tabs", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("activeTab");
    expect(detailSource).toContain('useState<(typeof detailTabs)[number]["key"]>("orderStatus")');
    expect(detailSource.indexOf('{ key: "orderStatus"')).toBeLessThan(
      detailSource.indexOf('{ key: "orderInfo"'),
    );
    expect(detailSource).toContain("orderInfo");
    expect(detailSource).toContain("customerRequests");
    expect(detailSource).toContain("orderStatus");
    expect(detailSource).toContain("assignment");
    expect(detailSource).toContain("sms");
    expect(detailSource).toContain("issues");
    expect(detailSource).toContain("timeline");
    expect(detailSource).toContain("상세 항목 탭");
    expect(detailSource).toContain("overflow-x-auto");
    expect(detailSource).toContain("whitespace-nowrap");
    expect(detailSource).toContain("shrink-0");
    expect(detailSource).not.toContain("flex flex-wrap gap-2 border-b");
    expect(detailSource).toContain('className="grid min-w-0 max-w-full gap-5"');
    expect(detailSource).toContain("OperationSummary");
    expect(detailSource).toContain("StatusActions");
    expect(detailSource).toContain("고객 정보");
    expect(detailSource).toContain("상품 및 설치 요구");
    expect(detailSource).toContain("원본 주문 정보");
    expect(detailSource).not.toContain("xl:grid-cols-2");
    expect(detailSource).not.toContain("상세 요약");
    expect(detailSource).not.toContain("summary");
  });

  it("shows inferred installation requirements on the detail page", () => {
    const detailPageSource = readFileSync(join(routesDir, "[installationId]", "page.tsx"), "utf8");
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailPageSource).toContain("parseRequiredCapabilitiesText");
    expect(detailPageSource).toContain("order.requiredAqaraAppCapability");
    expect(detailPageSource).toContain("listDispatchCandidateInstallers");
    expect(detailPageSource).toContain("findBestMatchingInstallers");
    expect(detailSource).toContain('label: "필수 설치 능력"');
    expect(detailSource).toContain('label: "Aqara 요구치"');
  });

  it("shows status and assignment history on the detail page", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("groupedStatusEvents.map");
    expect(detailSource).toContain("assignmentAttempts.map");
    expect(detailSource).toContain("event.fromStatus");
    expect(detailSource).toContain("assignment.assignmentNumber");
  });

  it("keeps linked detail data in tabs and renders dated history with the newest rows first", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("HistoryRows");
    expect(detailSource).toContain("HistoryRow");
    expect(detailSource).toContain("sortByCreatedAtDesc");
    expect(detailSource).toContain("sortByIssueTimelineDesc");
    expect(detailSource).toContain("sortByNotificationTimelineDesc");
    expect(detailSource).toContain("const statusEvents = sortByCreatedAtDesc(item.statusEvents)");
    expect(detailSource).toContain("const assignmentAttempts = sortByCreatedAtDesc(item.assignmentAttempts)");
    expect(detailSource).toContain("const customerRequests = sortByCreatedAtDesc(item.customerRequests)");
    expect(detailSource).toContain("const candidateRuns = sortByCreatedAtDesc(item.candidateRuns)");
    expect(detailSource).toContain("const smsNotifications = sortByNotificationTimelineDesc(item.smsNotifications)");
    expect(detailSource).toContain("groupedStatusEvents.map");
    expect(detailSource).toContain("assignmentAttempts.map");
    expect(detailSource).toContain("notifications.map");
    expect(detailSource).toContain("customerRequests.map");
    expect(detailSource).toContain("<CandidateRunHistory key={item.id} runs={candidateRuns} />");
    expect(detailSource).toContain("visibleRuns.map");
    expect(detailSource).not.toContain('className="rounded-md border border-zinc-200 p-3"');
  });

  it("renders customer request status as a readable label without the raw enum", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("title={formatCustomerRequestStatus(request.status)}");
    expect(detailSource).toContain("detail={formatCustomerRequestDetail(request)}");
    expect(detailSource).toContain("formatCustomerRequestMeta(request)");
    expect(detailSource).not.toContain("                  request.status,");
    expect(detailSource).not.toContain("title={formatText(request.installDate)}");
    expect(detailSource).not.toContain("detail={formatInstallAddress(request.installAddress, request.installAddressDetail)}");
  });

  it("renders SMS history with readable labels and no placeholder assignment or sent failure reason", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain('CUSTOMER_INPUT_LINK: "고객 예약 정보 입력 안내"');
    expect(detailSource).toContain('notification.recipientType === "INSTALLER"');
    expect(detailSource).toContain("formatText(notification.recipientName)");
    expect(detailSource).toContain("notification.recipientBranch");
    expect(detailSource).toContain("formatBackofficePhone(notification.recipientPhone)");
    expect(detailSource).not.toContain("배정 {notification.assignmentId}");
    expect(detailSource).toContain("getSmsFailureReasonText(notification)");
    expect(detailSource).toContain(
      'notification.status === "SENT" || notification.status === "DELIVERED"',
    );
    expect(detailSource).toContain("<SmsDeliveryStatus notification={notification} />");
    expect(detailSource).toContain("도달 실패");
    expect(detailSource).toContain("도달 성공");
    expect(detailSource).toContain("eligibilityLabel: null");
    expect(detailSource).toContain("failureReason: null");
  });

  it("formats phone numbers outside the address-focused installation summary", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("formatBackofficePhone");
    expect(detailSource).not.toContain("formatBackofficePhone(activeCustomerRequest?.customerPhone ?? item.sourcePhone)");
    expect(detailSource).toContain("formatBackofficePhone(item.sourcePhone)");
  });

  it("formats compact source order dates on the installation detail", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("formatBackofficeDateTime");
    expect(detailSource).toContain("formatBackofficeDateTime(item.sourceOrderDate)");
    expect(detailSource).not.toContain("formatText(item.sourceOrderDate)");
  });

  it("shows a back button on the installation detail header", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain('aria-label="설치 주문 목록으로 돌아가기"');
    expect(detailSource).toContain('displayMode === "panel"');
    expect(detailSource).toContain(">\n              닫기\n            </button>");
    expect(detailSource).not.toContain("상세 닫기");
    expect(detailSource).toContain("router.back()");
    expect(detailSource).toContain("router.push(returnPath)");
    expect(detailSource).toContain('<div className="flex min-w-0 items-start gap-3">');
    expect(detailSource).toContain('className="min-w-0"');
    expect(detailSource).toContain('className="shrink-0 whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950"');
    expect(detailSource).not.toContain('className="min-w-0 truncate font-mono text-sm text-zinc-500"');
    expect(detailSource).toContain('{ label: "주문번호", value: item.sourceErpOrderNo }');
    expect(detailSource).toContain('value: openIssues.length > 0 ? `열린 예외 ${openIssues.length}건` : "없음"');
    expect(detailSource).toContain('label: "설치 희망"');
    expect(detailSource).toContain('{ label: "설치 주소", value: formatText(activeCustomerRequest?.installAddress) }');
    expect(detailSource).toContain('{ label: "설치 기사 이름", value: currentInstallerName }');
    expect(detailSource).toContain('{ label: "설치 기사 브랜치", value: currentInstallerBranch }');
    expect(detailSource.indexOf('{ label: "주문번호"')).toBeLessThan(detailSource.indexOf('{ label: "현재 상태"'));
    expect(detailSource.indexOf('{ label: "현재 상태"')).toBeLessThan(detailSource.indexOf('{ label: "예외"'));
    expect(detailSource.indexOf('{ label: "예외"')).toBeLessThan(detailSource.indexOf('{ label: "설치 희망"'));
    expect(detailSource.indexOf('{ label: "설치 희망"')).toBeLessThan(detailSource.indexOf('{ label: "설치 주소"'));
    expect(detailSource.indexOf('{ label: "설치 주소"')).toBeLessThan(detailSource.indexOf('{ label: "설치 기사 이름"'));
    expect(detailSource.indexOf('{ label: "설치 기사 이름"')).toBeLessThan(detailSource.indexOf('{ label: "설치 기사 브랜치"'));
    expect(detailSource).not.toContain('{ label: "고객", value: formatText(item.sourceCustomerName) }');
    expect(detailSource).not.toContain('{ label: "전화", value: formatBackofficePhone(activeCustomerRequest?.customerPhone ?? item.sourcePhone) }');
    expect(detailSource).toContain('row.colSpan === 2 ? "col-span-2"');
    expect(detailSource).not.toContain('{ label: "희망시간", value:');
    expect(detailSource).not.toContain('meta={item.sourceErpOrderNo}');
  });

  it("keeps wide assignment and SMS content inside the detail panel", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("grid-cols-2 border-y border-zinc-200 bg-white lg:grid-cols-4");
    expect(detailSource).toContain("min-w-0 max-w-full overflow-hidden border-y border-zinc-200");
    expect(detailSource).toContain("min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-zinc-200");
    expect(detailSource).toContain('className="w-max min-w-[1040px] border-collapse text-left text-sm"');
    expect(detailSource).toContain('className="w-max min-w-[1200px] border-collapse text-left text-sm"');
  });

  it("shows SMS history and retry action on the detail page", () => {
    const detailPageSource = readFileSync(join(routesDir, "[installationId]", "page.tsx"), "utf8");
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailPageSource).toContain("order.notifications.map");
    expect(detailPageSource).toContain("assignmentInstallerById");
    expect(detailPageSource).toContain("recipientName");
    expect(detailPageSource).toContain("recipientBranch");
    expect(detailSource).toContain("notifications.map");
    expect(detailSource).toContain("retrySmsNotificationAction");
    expect(detailSource).toContain("getSmsNotificationAction");
  });

  it("shows SMS retry eligibility on the detail page", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("getSmsNotificationAction");
    expect(detailSource).not.toContain("label-installation-sms-retry.json");
    expect(detailSource).not.toContain("installationSmsRetryLabels");
    expect(detailSource).not.toContain("smsRetryLabels");
    expect(detailSource).toContain('eligibilityLabel: "재발송 가능"');
    expect(detailSource).toContain('failureReason: "실패 SMS"');
    expect(detailSource).toContain("재발송");
    expect(detailSource).toContain(
      'notification.status === "SENT" || notification.status === "DELIVERED"',
    );
  });

  it("maps detail aliases from the spec contract", () => {
    const detailPageSource = readFileSync(join(routesDir, "[installationId]", "page.tsx"), "utf8");
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailPageSource).toContain("auditEvents");
    expect(detailPageSource).toContain("code: issue.type");
    expect(detailSource).toContain("auditEvents:");
    expect(detailSource).toContain("code: string");
  });

  it("separates open and resolved issues on the detail page", () => {
    const detailPageSource = readFileSync(join(routesDir, "[installationId]", "page.tsx"), "utf8");
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );
    const detailQuerySource = readFileSync(
      join(process.cwd(), "src", "lib", "installation", "orders", "views", "detail.ts"),
      "utf8",
    );

    expect(detailQuerySource).toContain("resolvedAt");
    expect(detailPageSource).toContain("resolvedAt: issue.resolvedAt");
    expect(detailSource).toContain("openIssues");
    expect(detailSource).toContain("resolvedIssues");
    expect(detailSource).toContain('title="열린 예외"');
    expect(detailSource).toContain('title="해결된 예외"');
  });

  it("shows the current algorithm candidate list on the detail page", () => {
    const detailPageSource = readFileSync(join(routesDir, "[installationId]", "page.tsx"), "utf8");
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailPageSource).toContain("listDispatchCandidateInstallers");
    expect(detailPageSource).toContain("findBestMatchingInstallers");
    expect(detailPageSource).toContain("candidateRuns");
    expect(detailSource).toContain('title="현재 기사 후보"');
    expect(detailSource).toContain('title="기사 후보 탐색 이력"');
    expect(detailSource).toContain("<CandidateRunHistory key={item.id} runs={candidateRuns} />");
    expect(detailSource).toContain("visibleRuns.map");
    expect(detailSource).toContain("이력 {Math.min(CANDIDATE_RUN_HISTORY_PAGE_SIZE, remainingCount)}건 더보기");
    expect(detailSource).toContain("candidates.map");
  });

  it("shows full candidate fields on the detail page", () => {
    const detailPageSource = readFileSync(join(routesDir, "[installationId]", "page.tsx"), "utf8");
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailPageSource).toContain("hasAqaraHubInventory");
    expect(detailSource).toContain("candidate.region");
    expect(detailSource).toContain("formatList(candidate.serviceAreas)");
    expect(detailSource).toContain("candidate.hasAqaraHubInventory");
  });

  it("does not expose legacy pre-review actions on installer request history", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("approveInstallationAssignmentAction");
    expect(detailSource).not.toContain("cancelInstallationAssignmentAction");
  });

  it("exposes spec-based admin manual transition and completion actions on detail page", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("switchInstallationOrderToManualRequiredAction");
    expect(detailSource).toContain("completeInstallationOrderAction");
    expect(detailSource).toContain("retryInstallationOrderAssignmentByAdminAction");
    expect(detailSource).toContain("canSwitchToManual");
    expect(detailSource).toContain("canComplete");
    expect(detailSource).toContain("canManuallyAssign");
    expect(detailSource).toContain("canRetryAssignment");
  });

  it("confirms cancellation and completion after capturing an admin reason", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("AdminActionDialog");
    expect(detailSource).toContain("설치 완료 처리 사유를 입력하세요.");
    expect(detailSource).toContain("주문 취소 사유를 입력하세요.");
    expect(detailSource).toContain("설치 완료로 종료합니다. 활성 배정은 관리자 완료로 닫히고 이후 자동 진행은 실행되지 않습니다.");
    expect(detailSource).toContain("설치건을 취소 상태로 종료합니다. 원천 주문 시스템의 주문 취소 요청은 보내지 않습니다.");
    expect(detailSource).not.toContain("window.prompt");
    expect(detailSource).not.toContain("window.confirm");
  });

  it("formats each status action as a title and one merged description", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("getStatusActions");
    expect(detailSource).not.toContain("label-installation-title-action.json");
    expect(detailSource).not.toContain("installationActionLabels");
    expect(detailSource).toContain("disabledReason");
    expect(detailSource).toContain("pending || !action.enabled");
    expect(detailSource).not.toContain("결과 상태");
    expect(detailSource).not.toContain("nextStep");
    expect(detailSource).toContain("OperationalDecisionCard");
    expect(detailSource).toContain("자동 후보/기사 응답 흐름을 멈추고 처리 필요 항목으로 표시합니다. 이후 직접 기사 지정 또는 후보 다시 찾기를 실행할 수 있으며, 고객이나 기사에게 자동 SMS는 발송하지 않습니다.");
    expect(detailSource).toContain("기사가 실제 설치를 끝낸 건으로 확정합니다. 활성 배정 시도가 있으면 관리자 완료로 닫고, 설치건은 완료 상태로 종료합니다.");
    expect(detailSource).toContain("설치건을 취소 상태로 종료합니다. 자동 배정, 고객 리마인드, 기사 timeout 처리를 모두 멈추며, 원천 주문 시스템에는 주문 취소 요청을 보내지 않습니다.");
    expect(detailSource).toContain("후보 선정 가능 또는 관리자 검토 대기 상태에서 직접 지정할 수 있습니다. 기사 응답 대기 상태는 열린 예외 또는 배송지 폴백 주문만 가능합니다.");
  });

  it("shows manual assignment eligibility and only asks a reason for region mismatch", () => {
    const detailSource = readFileSync(
      join(routesDir, "[installationId]", "InstallationOrderDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("getManualAssignmentCandidate");
    expect(detailSource).toContain("requiresManualAssignmentReason");
    expect(detailSource).toContain("candidate.region");
    expect(detailSource).toContain("candidate.serviceAreas");
    expect(detailSource).toContain("candidate.matchTier");
  });

  it("uses the normal installation order loader even when obsolete query parameters are present", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "active", mock: "true", raw: "true" }),
    });
    const renderedView = await renderServerElement(element);

    expect(listInstallationOrderStatuses).toHaveBeenCalledWith({
      query: "",
      searchCondition: undefined,
      statusView: "active",
      limit: 20,
      offset: 0,
    });
    expect(renderedView).toMatchObject({
      props: {
        initialItems: [],
      },
    });
  });

  it("does not render raw installation order data when obsolete query parameters are present", async () => {
    const pageSource = readFileSync(join(routesDir, "page.tsx"), "utf8");
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "active", mock: "true", raw: "true" }),
    });

    const renderedView = await renderServerElement(element);
    const renderedText = getRenderedText(renderedView);

    expect(renderedText).not.toContain("응답 데이터");
    expect(pageSource).not.toContain("renderRawDataSection");
  });

  it("renders installation order list data without raw JSON output", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([
      {
        id: "order-1",
        sourceErpOrderNo: "ONS20260604942",
        sourceCustomerName: "강지훈",
        sourcePhone: "01042226824",
        sourceAddress: "인천 연수구 송도문화로28번길 27",
        sourceExternalOrderNumbers: null,
        sourceNoGirl: null,
        sourceMemo: "[지니스펙트럼PICK_앱 설치] 스마트 도어락 K100 x1",
        sourceItemsJsonText: '[{"item_code":"ANB-DBNB-01CC-N","item_name":"스마트 도어락 K100","quantity":1}]',
        requiredCapabilities: "DOORLOCK",
        requiredAqaraAppCapability: "DOORLOCK_AND_APP",
        sourceOrderDate: "20260616",
        status: "WAITING_CUSTOMER_INPUT",
        activeCustomerRequestId: null,
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: false,
        statusChangedAt: new Date("2026-06-16T05:11:28.983Z"),
        createdAt: new Date("2026-06-16T05:11:28.983Z"),
        customerRequests: [],
        assignmentAttempts: [],
        issues: [],
      },
    ]);

    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "active" }),
    });

    const renderedView = await renderServerElement(element);
    const renderedText = getRenderedText(renderedView);

    expect(renderedView).toMatchObject({
      props: {
        initialItems: [
          expect.objectContaining({
            erpOrderNo: "ONS20260604942",
            customerName: "강지훈",
            phone: "01042226824",
          }),
        ],
      },
    });
    expect(renderedText).not.toContain("응답 데이터");
    expect(renderedText).not.toContain("\"sourceCustomerNameEncrypted\"");
    expect(renderedText).not.toContain("\"sourcePhoneEncrypted\"");
  });

  it("keeps obsolete assignment request query parameters on the unified installation order loader", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "active", view: "assignment-requests", mock: "true" }),
    });

    const renderedView = await renderServerElement(element);

    expect(listActiveInstallerRequestAssignments).not.toHaveBeenCalled();
    expect(listInstallationOrderStatuses).toHaveBeenCalledWith({
      query: "",
      searchCondition: undefined,
      statusView: "active",
      limit: 20,
      offset: 0,
    });
    expect(renderedView).toMatchObject({
      props: {
        initialItems: [],
      },
    });
  });

  it("keeps the waiting admin review queue inside the installation queue tabs", async () => {
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);

    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "waitingAdminReview" }),
    });
    const renderedView = await renderServerElement(element);

    expect(listActiveInstallerRequestAssignments).not.toHaveBeenCalled();
    expect(listInstallationOrderStatuses).toHaveBeenCalledWith({
      query: "",
      searchCondition: undefined,
      statusView: "waitingAdminReview",
      limit: 20,
      offset: 0,
    });
    expect(renderedView).toMatchObject({
      props: {
        statusFilterItems: expect.arrayContaining([
          expect.objectContaining({ statusView: "waitingAdminReview", label: "배정 승인 대기" }),
        ]),
        statusView: "waitingAdminReview",
        title: "설치 업무 큐",
      },
    });
  });

  it("uses the normal detail loader even when obsolete query parameters are present", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(getInstallationOrderStatusDetail).mockResolvedValue(createInstallationOrderDetail());
    vi.mocked(listDispatchCandidateInstallers).mockResolvedValue([]);
    const element = await InstallationDetailPage({
      params: Promise.resolve({ installationId: "1" }),
      searchParams: Promise.resolve({ mock: "true" }),
    });

    expect(getInstallationOrderStatusDetail).toHaveBeenCalledWith("1");
    expect(element).toMatchObject({
      props: {
        item: expect.objectContaining({
          id: "1",
          sourceErpOrderNo: "ORDER-001",
        }),
      },
    });
  });

  it("protects the backoffice root without automatically entering installation management", () => {
    const rootSource = readFileSync(join(backofficeDir, "page.tsx"), "utf8");

    expect(rootSource).toContain('requireBackofficeUserPage("/backoffice", 1)');
    expect(rootSource).not.toContain('redirect("/backoffice/installations")');
    expect(rootSource).toContain("getBackofficeDashboardChartSummary");
  });

  it("requires approved backoffice access on the backoffice root", async () => {
    vi.mocked(requireBackofficeUserPage).mockResolvedValue({
      id: "bo-1",
      supabaseUserId: "supabase-1",
      email: "viewer@example.com",
      level: 1,
    });

    const element = await BackofficePage();

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice", 1);
    expect(getBackofficeDashboardChartSummary).toHaveBeenCalledWith({ days: 14 });
    expect(isValidElement(element)).toBe(true);

    const rootSource = readFileSync(join(backofficeDir, "page.tsx"), "utf8");
    expect(rootSource).toContain("신규 주문과 설치 완료 추이");
    expect(rootSource).toContain("현재 대기 상태 분포");
    expect(rootSource).toContain("기간 집계가 아니라 지금 남아 있는 상태별 주문 수입니다.");
    expect(rootSource).not.toContain("권한 승인 대기");
    expect(rootSource).not.toContain("Cron 호출 상태");
    expect(rootSource).not.toContain("처리 필요 항목");
    expect(rootSource).not.toContain("설치 주문 보기");
    expect(rootSource).not.toContain("운영 설정");
    expect(rootSource).not.toContain("데이터 가져오기");
    expect(rootSource).not.toContain("관리 메뉴");
    expect(rootSource).not.toContain("진행 중인 설치 주문과 전체 주문을 조회합니다.");
  });

  it("keeps the backoffice root focused on charts instead of dashboard cards", () => {
    const rootSource = readFileSync(join(backofficeDir, "page.tsx"), "utf8");

    expect(rootSource).toContain("DailyOrdersChart");
    expect(rootSource).toContain("QueueStatusChart");
    expect(rootSource).not.toContain("renderDashboardInfoCard");
    expect(rootSource).not.toContain("attentionItems.map");
    expect(rootSource).not.toContain("Cron 호출 상태");
  });

  it("passes the current installation board query string as the login return path", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);

    const element = await InstallationsPage({
      searchParams: Promise.resolve({
        statusView: "waitingInstallerResponse",
        searchField: "orderNumber",
        searchKeyword: "ORD-100",
      }),
    });

    await renderServerElement(element);

    expect(requireBackofficeUserPage).toHaveBeenCalledWith(
      "/backoffice/installations?statusView=waitingInstallerResponse",
      1,
    );
  });

  it("passes the installation order keyword query from the dedicated search page to the server-side list loader", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);

    const element = await InstallationSearchPage({
      searchParams: Promise.resolve({
        searchField: "orderNumber",
        searchKeyword: "ONS20260604942",
      }),
    });

    const renderedView = await renderServerElement(element);

    expect(listInstallationOrderStatuses).toHaveBeenCalledWith({
      query: "",
      searchCondition: { field: "orderNumber", keyword: "ONS20260604942" },
      statusView: "all",
      limit: 20,
      offset: 0,
    });
    expect(renderedView).toMatchObject({
      props: {
        searchCondition: { field: "orderNumber", keyword: "ONS20260604942" },
      },
    });
  });

  it("redirects the dedicated order search page to the default order date query on first load", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T01:00:00+09:00"));

    try {
      await expect(
        InstallationSearchPage({
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow(
        "NEXT_REDIRECT:/backoffice/installation-search?searchField=orderDate&searchFrom=2026-05-25&searchTo=2026-06-24",
      );
      expect(redirectMock).toHaveBeenCalledWith(
        "/backoffice/installation-search?searchField=orderDate&searchFrom=2026-05-25&searchTo=2026-06-24",
      );
      expect(listInstallationOrderStatuses).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not run the dedicated order search when a selected keyword condition has no value", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockClear();
    vi.mocked(countInstallationOrderStatuses).mockClear();

    const element = await InstallationSearchPage({
      searchParams: Promise.resolve({
        searchField: "orderNumber",
        searchKeyword: "",
      }),
    });

    const renderedView = await renderServerElement(element);

    expect(listInstallationOrderStatuses).not.toHaveBeenCalled();
    expect(countInstallationOrderStatuses).not.toHaveBeenCalled();
    expect(renderedView).toMatchObject({
      props: {
        searchCondition: undefined,
      },
    });
  });

  it("does not run the dedicated order search when a selected date condition has no dates", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockClear();
    vi.mocked(countInstallationOrderStatuses).mockClear();

    const element = await InstallationSearchPage({
      searchParams: Promise.resolve({
        searchField: "orderDate",
      }),
    });

    const renderedView = await renderServerElement(element);

    expect(listInstallationOrderStatuses).not.toHaveBeenCalled();
    expect(countInstallationOrderStatuses).not.toHaveBeenCalled();
    expect(renderedView).toMatchObject({
      props: {
        searchCondition: undefined,
      },
    });
  });

  it("does not run the dedicated order search when a selected date condition is not a real calendar date", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockClear();
    vi.mocked(countInstallationOrderStatuses).mockClear();

    const element = await InstallationSearchPage({
      searchParams: Promise.resolve({
        searchField: "orderDate",
        searchFrom: "2026-02-31",
        searchTo: "2026-03-01",
      }),
    });

    const renderedView = await renderServerElement(element);

    expect(listInstallationOrderStatuses).not.toHaveBeenCalled();
    expect(countInstallationOrderStatuses).not.toHaveBeenCalled();
    expect(renderedView).toMatchObject({
      props: {
        searchCondition: undefined,
      },
    });
  });

  it("defaults the installation order board to the action-required attention queue without a date search condition", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T01:00:00+09:00"));

    try {
      const element = await InstallationsPage({
        searchParams: Promise.resolve({ statusView: "active" }),
      });

      const renderedView = await renderServerElement(element);

      expect(listInstallationOrderStatuses).toHaveBeenCalledWith({
        query: "",
        searchCondition: undefined,
        statusView: "active",
        limit: 20,
        offset: 0,
      });
      expect(renderedView).toMatchObject({
        props: {
          searchCondition: undefined,
          statusView: "active",
          showSearchControls: false,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("redirects the installation order board to the explicit active queue query", async () => {
    await expect(
      InstallationsPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/backoffice/installations?statusView=active");
  });

  it("redirects terminal installation queue filters back to the active workflow queue", async () => {
    await expect(
      InstallationsPage({
        searchParams: Promise.resolve({ statusView: "completed" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/backoffice/installations?statusView=active");
  });

  it("redirects out-of-range installation queue pages to the last available page", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockClear();
    vi.mocked(countInstallationOrderStatuses).mockResolvedValue(5);

    const element = await InstallationsPage({
      searchParams: Promise.resolve({ statusView: "active", page: "3", pageSize: "20" }),
    });

    await expect(renderServerElement(element)).rejects.toThrow(
      "NEXT_REDIRECT:/backoffice/installations?statusView=active&page=1&pageSize=20",
    );
    expect(listInstallationOrderStatuses).not.toHaveBeenCalled();
  });

  it("applies the same status-changed range to status filter counts", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);
    vi.mocked(countInstallationOrderStatuses).mockResolvedValue(0);

    const element = createElement(InstallationOrderListView, {
      basePath: "/backoffice/installations",
      historyDateRange: { from: "2026-06-01", to: "2026-06-30" },
      query: "",
      searchParams: { statusView: "active" },
      statusFilterItems: [
        { statusView: "active", label: "전체 진행 중" },
        { statusView: "attention", label: "처리 필요/예외" },
      ],
      statusView: "active",
    });

    await renderServerElement(element);

    expect(countInstallationOrderStatuses).toHaveBeenCalledWith(
      expect.objectContaining({
        statusView: "attention",
        statusChangedFrom: expect.any(Date),
        statusChangedTo: expect.any(Date),
      }),
    );
  });

  it("strips ignored status filters from the dedicated order search page before loading results", async () => {
    vi.mocked(requireBackofficeUserPage).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockClear();
    vi.mocked(listInstallationOrderStatuses).mockResolvedValue([]);

    await expect(
      InstallationSearchPage({
        searchParams: Promise.resolve({
          statusView: "assigned",
          searchField: "customerName",
          searchKeyword: "홍길동",
        }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/backoffice/installation-search?searchField=customerName&searchKeyword=%ED%99%8D%EA%B8%B8%EB%8F%99",
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/backoffice/installation-search?searchField=customerName&searchKeyword=%ED%99%8D%EA%B8%B8%EB%8F%99",
    );
    expect(listInstallationOrderStatuses).not.toHaveBeenCalled();
  });

  it("shows status filter tabs with counts instead of a separate progress step section", () => {
    const pageSource = readFileSync(join(routesDir, "page.tsx"), "utf8");
    const loadingSource = readFileSync(join(routesDir, "loading.tsx"), "utf8");
    const listSource = readFileSync(join(routesDir, "InstallationOrderList.tsx"), "utf8");

    expect(pageSource).toContain("statusFilterItems");
    expect(pageSource).not.toContain("progressStepItems");
    expect(pageSource).toContain("normalizeInstallationOrderStatusView");
    expect(loadingSource).not.toContain("진행 단계");
    expect(listSource).not.toContain("InstallationOrderProgressSteps");
    expect(listSource).not.toContain("aria-label=\"설치 주문 진행 단계\"");
    expect(listSource).not.toContain("→");
    expect(listSource).toContain("count");
    expect(listSource).toContain("getStatusViewTabCountClassName");
    expect(listSource).toContain("tabular-nums");
    expect(listSource).not.toContain("{tab.count}건");
  });
});
