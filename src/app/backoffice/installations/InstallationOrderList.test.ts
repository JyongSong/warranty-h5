import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InstallationOrderList, {
  getDefaultInlineSearchDateRange,
  type InstallationOrderListItem,
} from "./InstallationOrderList";

vi.mock("./actions", () => ({
  approveInstallationAssignmentsAction: vi.fn(),
  sendCustomerInputSmsForInstallationOrdersAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/backoffice/installations",
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

function createItem(overrides: Partial<InstallationOrderListItem> = {}): InstallationOrderListItem {
  return {
    id: "order-1",
    installationId: "order-1",
    erpOrderNo: "ONS20260605893",
    customerName: "홍길동",
    phone: "01012345678",
    sourceAddress: "경남 진주시 초전북로62번길 32 더하임403호",
    itemName: null,
    productSummary: null,
    sourceItemsJsonText: null,
    sourceOrderDate: "2026-06-21",
    status: "WAITING_CUSTOMER_INPUT",
    currentInstallerId: null,
    hasOpenIssue: false,
    issueCodes: [],
    statusChangedAt: "2026-06-21T15:10:18.346Z",
    request: {
      id: "request-1",
      installAddress: null,
      installDate: null,
      installTimeSlot: null,
      customerPhone: null,
      fallbackUsed: false,
      status: "PENDING_INPUT",
    },
    assignment: null,
    activeAttempt: null,
    customerRequest: null,
    ...overrides,
  };
}

describe("InstallationOrderList", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("defaults the desired install date inline search range to today through two weeks later", () => {
    expect(getDefaultInlineSearchDateRange("desiredInstallDate", new Date("2026-06-24T01:00:00+09:00"))).toEqual({
      from: "2026-06-24",
      to: "2026-07-08",
    });
    expect(getDefaultInlineSearchDateRange("orderDate", new Date("2026-06-24T01:00:00+09:00"))).toBeUndefined();
  });

  it("orders active table columns by order number, installation, assignment, order context, and fixed operations", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [
          createItem({
            assignment: {
              id: "assignment-1",
              installerId: "installer-1",
              installerName: "김기사",
              installerBranch: "서울강남지점",
              assignmentNumber: 1,
              status: "WAITING_INSTALLER_RESPONSE",
              createdAt: "2026-06-21T15:20:18.346Z",
            },
            activeAttempt: {
              id: "assignment-1",
              installerId: "installer-1",
              assignmentType: "AUTO",
              assignmentStatus: "WAITING_INSTALLER_RESPONSE",
              createdAt: "2026-06-21T15:20:18.346Z",
            },
          }),
        ],
      }),
    );

    const expectedHeaders = [
      "주문-주문번호",
      "설치-희망일",
      "설치-희망시간",
      "설치-주소",
      "설치-설치연락처",
      "배정-기사",
      "배정-브랜치",
      "배정-상태",
      "주문-고객명",
      "주문-고객 전화",
      "주문-고객주소",
      "주문-메모",
      "운영-처리 사유",
      "운영-다음 조치",
      "운영-상태",
    ];

    const headerIndexes = expectedHeaders.map((header) => html.indexOf(header));
    expect(headerIndexes.every((index) => index >= 0)).toBe(true);
    expect(headerIndexes).toEqual([...headerIndexes].sort((left, right) => left - right));
    expect(html).toContain("김기사");
    expect(html).toContain("서울강남지점");
    expect(html).toContain("기사 응답 대기");
    expect(html).not.toContain("WAITING_INSTALLER_RESPONSE");
    expect(html).not.toContain("상세");
  });

  it("keeps the same operational columns on completed and cancelled filters, with completion tracking appended", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem({ status: "COMPLETED" })],
        statusView: "completed",
      }),
    );

    const expectedHeaders = [
      "주문-주문번호",
      "설치-희망일",
      "설치-희망시간",
      "설치-주소",
      "설치-설치연락처",
      "배정-기사",
      "배정-브랜치",
      "배정-상태",
      "주문-고객명",
      "주문-고객 전화",
      "주문-고객주소",
      "주문-메모",
      "운영-처리 사유",
      "운영-다음 조치",
      "운영-상태",
      "처리일",
      "최종 기사",
    ];

    const headerIndexes = expectedHeaders.map((header) => html.indexOf(header));
    expect(headerIndexes.every((index) => index >= 0)).toBe(true);
    expect(headerIndexes).toEqual([...headerIndexes].sort((left, right) => left - right));
    expect(html).not.toContain("처리-결과");
    expect(html).not.toContain("처리-변경 시각");
  });

  it("shows a concrete operational reason and next action for open installer SMS issues", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [
          createItem({
            status: "READY_FOR_CANDIDATE_SELECTION",
            hasOpenIssue: true,
            issueCodes: ["INSTALLER_ASSIGNMENT_SMS_SEND_FAILED"],
          }),
        ],
      }),
    );

    expect(html).toContain("기사 배정 SMS 확인");
    expect(html).toContain("SMS 확인 후 기사 재배정");
    expect(html).not.toContain(">관리자 확인<");
  });

  it("shows bulk customer input SMS controls for selectable waiting orders", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        statusView: "customerInputSmsRequired",
        initialItems: [
          createItem({
            id: "order-1",
            erpOrderNo: "ONS20260605893",
            status: "CUSTOMER_INPUT_SMS_REQUIRED",
            customerRequest: null,
          }),
          createItem({
            id: "order-2",
            erpOrderNo: "ONS20260605894",
            status: "READY_FOR_CANDIDATE_SELECTION",
          }),
        ],
      }),
    );

    expect(html).toContain("선택 문자 발송");
    expect(html).toContain('aria-label="ONS20260605893 주문 선택"');
    expect(html).toContain('aria-label="발송 가능한 주문 전체 선택"');
    expect(html).not.toContain('aria-label="ONS20260605894 주문 선택"');
  });

  it("hides bulk customer input SMS controls outside the customer SMS queue", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        statusView: "active",
        initialItems: [
          createItem({
            id: "order-1",
            erpOrderNo: "ONS20260605893",
            status: "CUSTOMER_INPUT_SMS_REQUIRED",
            customerRequest: null,
          }),
        ],
      }),
    );

    expect(html).not.toContain("선택 문자 발송");
    expect(html).not.toContain('aria-label="ONS20260605893 주문 선택"');
    expect(html).not.toContain('aria-label="발송 가능한 주문 전체 선택"');
  });

  it("shows bulk assignment approval controls on the admin review queue", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        statusView: "waitingAdminReview",
        initialItems: [
          createItem({
            id: "order-1",
            erpOrderNo: "ISU20260700554",
            status: "WAITING_ADMIN_REVIEW",
            assignment: {
              id: "assignment-1",
              installerId: "installer-1",
              installerName: "송지용",
              installerBranch: "서울",
              assignmentNumber: 1,
              status: "WAITING_ADMIN_REVIEW",
              createdAt: "2026-07-10T09:00:00.000Z",
            },
            activeAttempt: {
              id: "assignment-1",
              installerId: "installer-1",
              assignmentType: "AUTO",
              assignmentStatus: "WAITING_ADMIN_REVIEW",
              createdAt: "2026-07-10T09:00:00.000Z",
            },
          }),
        ],
      }),
    );

    expect(html).toContain("선택 일괄 승인");
    expect(html).toContain('aria-label="승인 가능한 배정 전체 선택"');
    expect(html).toContain('aria-label="ISU20260700554 배정 선택"');
  });

  it("does not show the source address as the install address while waiting for customer input", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, { initialItems: [createItem()] }),
    );

    expect(html).toContain("주문-고객주소");
    expect(html).toContain("경남 진주시 초전북로62번길 32 더하임403호");
    expect(html).toContain("ONS20260605893");
  });

  it("shows the ERP source memo as an order memo column", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [
          createItem({
            productSummary: "[지니스펙트럼PICK_앱 설치] 용역 도어락 설치비(K100) x1 / 용역 출장비 x1",
          }),
        ],
      }),
    );

    expect(html).toContain("주문-메모");
    expect(html).toContain("[지니스펙트럼PICK_앱 설치] 용역 도어락 설치비(K100) x1 / 용역 출장비 x1");
    expect(html).toContain("truncate text-zinc-700");
  });

  it("does not show the ERP source date as the desired install date before customer input is requested", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [
          createItem({
            status: "CUSTOMER_INPUT_SMS_REQUIRED",
            sourceOrderDate: "20260624",
            request: null,
            customerRequest: null,
          }),
        ],
      }),
    );

    expect(html.match(/2026-06-24/g)).toHaveLength(1);
    expect(html).not.toContain("희망일 확인 필요");
    expect(html).not.toContain("희망일 없음");
  });

  it("uses KST calendar days for schedule attention labels around midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T16:30:00.000Z"));

    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [
          createItem({
            status: "READY_FOR_CANDIDATE_SELECTION",
            request: {
              id: "request-1",
              installAddress: "서울 강남구 테헤란로 1",
              installDate: "2026-06-25",
              installTimeSlot: null,
              customerPhone: "01012345678",
              fallbackUsed: false,
              status: "SUBMITTED",
            },
            customerRequest: {
              id: "request-1",
              installAddress: "서울 강남구 테헤란로 1",
              installDate: "2026-06-25",
              installTimeSlot: null,
              customerPhone: "01012345678",
              fallbackUsed: false,
            },
          }),
        ],
      }),
    );

    expect(html).not.toContain("1일 남음");
    expect(html).not.toContain("1일 지남");
  });

  it("uses the order number as the only detail affordance in each row", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, { initialItems: [createItem()] }),
    );

    expect(html).toContain('href="/backoffice/installations/order-1"');
    expect(html).toContain("ONS20260605893");
    expect(html).not.toContain('aria-label="ONS20260605893 주문 상세 보기"');
    expect(html).not.toContain('title="주문 상세 보기"');
    expect(html).not.toContain("→");
  });

  it("keeps detail links inside the current list route context", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        basePath: "/backoffice/installation-search",
      }),
    );

    expect(html).toContain('href="/backoffice/installation-search/order-1"');
    expect(html).not.toContain('href="/backoffice/installations/order-1"');
  });

  it("shows inline conditional search controls without the obsolete keyword query", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        searchQuery: "홍길동",
      }),
    );

    expect(html).toContain('method="get"');
    expect(html).toContain('name="searchField"');
    expect(html).toContain('name="searchFrom"');
    expect(html).toContain('name="searchTo"');
    expect(html).toMatch(/<input(?=[^>]*name="searchFrom")(?=[^>]*required="")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*name="searchTo")(?=[^>]*required="")[^>]*>/);
    expect(html).not.toContain('name="q"');
    expect(html).not.toContain("검색 초기화");
  });

  it("can hide search controls for queue-only pages", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        showSearchControls: false,
        statusFilterItems: [
          { statusView: "attention", label: "처리 필요/예외" },
          { statusView: "waitingCustomerInput", label: "고객 입력 대기" },
        ],
      }),
    );

    expect(html).not.toContain('name="searchField"');
    expect(html).not.toContain("검색 조건");
    expect(html).toContain("처리 필요/예외");
    expect(html).toContain("고객 입력 대기");
    expect(html).toContain('class="@container"');
    expect(html).toContain("flex min-w-0 flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between");
    expect(html).toContain('class="self-end"');
  });

  it("places column controls beside search and before status filters and bulk actions", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        statusView: "customerInputSmsRequired",
        statusFilterItems: [
          { statusView: "active", label: "전체 진행 중" },
          { statusView: "customerInputSmsRequired", label: "고객 문자 발송 필요" },
        ],
      }),
    );

    expect(html).not.toContain("조회 조건");
    expect(html.indexOf("검색 조건")).toBeLessThan(html.indexOf("컬럼 보기"));
    expect(html.indexOf("컬럼 보기")).toBeLessThan(html.indexOf("고객 문자 발송 필요"));
    expect(html.indexOf("고객 문자 발송 필요")).toBeLessThan(html.indexOf("선택 문자 발송"));
    expect(html.indexOf("컬럼 보기")).toBeLessThan(html.indexOf("컬럼 순서"));
    expect(html).toContain('class="@container"');
    expect(html).toContain("flex min-w-0 flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between");
    expect(html).toContain('class="self-end"');
    expect(html).not.toContain("상태:");
  });

  it("renders search controls inline instead of behind a popup trigger", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        searchCondition: { field: "orderDate", from: "2026-06-24", to: "2026-06-24" },
      }),
    );

    expect(html).toContain('method="get"');
    expect(html).toContain('name="searchField"');
    expect(html).toContain('name="searchFrom"');
    expect(html).toContain('name="searchTo"');
    expect(html).toContain('value="orderDate"');
    expect(html).toContain('value="2026-06-24"');
    const searchOptionOrder = [
      'value="orderDate"',
      'value="desiredInstallDate"',
      'value="orderNumber"',
      'value="customerName"',
      'value="customerPhone"',
      'value="installerName"',
      'value="installerPhone"',
    ].map((optionValue) => html.indexOf(optionValue));
    expect(searchOptionOrder.every((index) => index >= 0)).toBe(true);
    expect(searchOptionOrder).toEqual([...searchOptionOrder].sort((left, right) => left - right));
    expect(html).not.toContain('aria-label="검색 조건 열기"');
    expect(html).not.toContain("닫기");
  });

  it("keeps the keyword search field responsive inside the search container", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        searchCondition: { field: "customerName", keyword: "홍길동" },
      }),
    );

    expect(html).toContain("grid grid-cols-2 items-end gap-3 @3xl:grid-cols-[minmax(11rem,auto)_minmax(0,1fr)_auto_auto]");
    expect(html).toContain("col-span-2 flex min-w-0 flex-col gap-1 @3xl:col-span-1");
    expect(html).toContain("col-span-2 text-xs leading-5 text-zinc-500 @3xl:col-span-4");
    expect(html).toContain('name="searchKeyword"');
    expect(html).toMatch(/<input(?=[^>]*name="searchKeyword")(?=[^>]*required="")[^>]*>/);
  });

  it("places column controls beside search and before filters and the table", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        statusFilterItems: [
          { statusView: "active", label: "전체 진행 중" },
          { statusView: "attention", label: "처리 필요/예외" },
        ],
      }),
    );

    expect(html).not.toContain("조회 조건");
    expect(html.indexOf("검색 조건")).toBeLessThan(html.indexOf("컬럼 보기"));
    expect(html.indexOf("컬럼 보기")).toBeLessThan(html.indexOf("처리 필요/예외"));
    expect(html.indexOf("컬럼 순서")).toBeLessThan(html.indexOf("주문-주문번호"));
    expect(html).toContain('class="@container"');
    expect(html).toContain("flex min-w-0 flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between");
    expect(html).toContain("min-w-0 flex-1");
  });

  it("groups queue filters into overview tabs and stage tabs", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        statusFilterItems: [
          { statusView: "active", label: "전체 진행 중", count: 97 },
          { statusView: "attention", label: "처리 필요/예외", count: 2 },
          { statusView: "waitingCustomerInput", label: "고객 입력 대기", count: 87 },
          { statusView: "customerInputSmsRequired", label: "고객 문자 발송 필요", count: 2 },
          { statusView: "preAssignment", label: "기사 배정 전", count: 0 },
        ],
      }),
    );

    expect(html).toContain('aria-label="설치 주문 필터"');
    expect(html).toContain('aria-label="보기"');
    expect(html).toContain('aria-label="진행 단계"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("rounded-lg bg-zinc-100 p-1");
    expect(html).toContain("bg-white");
    expect(html).toContain("전체 진행 중");
    expect(html).toContain("처리 필요/예외");
    expect(html).toContain("<span>전체</span>");
    expect(html).toContain("tabular-nums");
    expect(html).toContain(">97</span>");
    expect(html).not.toContain("97건");
    expect(html).toContain("고객 문자 발송 필요");
    expect(html).not.toContain("주문 진행 상태");
    expect(html).not.toContain("border-red-200");
    expect(html).not.toContain("border-l border-zinc-200");
  });

  it("shows exclusive attention sub-tabs while the attention overview is selected", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        statusView: "attention",
        statusFilterItems: [
          { statusView: "active", label: "전체 진행 중", count: 97 },
          { statusView: "attention", label: "처리 필요/예외", count: 2 },
          { statusView: "attentionCustomerInputSmsRequired", label: "고객 문자 발송 필요", count: 1 },
          { statusView: "attentionAdminReview", label: "배정 승인 대기", count: 1 },
          { statusView: "attentionIssueOnly", label: "예외 이슈", count: 1 },
          { statusView: "waitingCustomerInput", label: "고객 입력 대기", count: 87 },
          { statusView: "customerInputSmsRequired", label: "고객 문자 발송 필요", count: 2 },
        ],
      }),
    );

    expect(html).toContain('aria-label="보기"');
    expect(html).toContain("전체 진행 중");
    expect(html).toContain("처리 필요/예외");
    expect(html).toContain('aria-label="진행 단계"');
    expect(html).toContain("<span>전체</span>");
    expect(html).toContain("고객 문자 발송 필요");
    expect(html).toContain("배정 승인 대기");
    expect(html).toContain("예외 이슈");
    expect(html).toContain('href="/backoffice/installations?statusView=attentionCustomerInputSmsRequired"');
    expect(html).toContain('href="/backoffice/installations?statusView=attentionAdminReview"');
    expect(html).toContain('href="/backoffice/installations?statusView=attentionIssueOnly"');
    expect(html).not.toContain('href="/backoffice/installations?statusView=waitingCustomerInput"');
    expect(html).not.toContain('href="/backoffice/installations?statusView=customerInputSmsRequired"');
  });

  it("keeps the default active queue filter explicit in generated links and forms", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        statusView: "active",
        statusFilterItems: [
          { statusView: "active", label: "전체 진행 중" },
          { statusView: "attention", label: "처리 필요/예외" },
        ],
      }),
    );

    expect(html).toContain('href="/backoffice/installations?statusView=active"');
    expect(html).toContain('name="statusView"');
    expect(html).toContain('value="active"');
  });

  it("uses status change recency as the default active queue ordering", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [createItem()],
        statusView: "active",
      }),
    );

    expect(html).toMatch(/aria-sort="descending"[\s\S]*처리일/);
  });

  it("shows the install contact from the customer request separately from the order phone", () => {
    const html = renderToStaticMarkup(
      createElement(InstallationOrderList, {
        initialItems: [
          createItem({
            phone: "01011112222",
            request: {
              id: "request-1",
              installAddress: "서울 강남구 테헤란로 1",
              installDate: "2026-06-23",
              installTimeSlot: "오전",
              customerPhone: "01033334444",
              fallbackUsed: false,
              status: "SUBMITTED",
            },
            customerRequest: {
              id: "request-1",
              installAddress: "서울 강남구 테헤란로 1",
              installDate: "2026-06-23",
              installTimeSlot: "오전",
              customerPhone: "01033334444",
              fallbackUsed: false,
            },
          }),
        ],
      }),
    );

    expect(html).toContain("주문-고객 전화");
    expect(html).toContain("010-1111-2222");
    expect(html).toContain("설치-설치연락처");
    expect(html).toContain("010-3333-4444");
  });
});
