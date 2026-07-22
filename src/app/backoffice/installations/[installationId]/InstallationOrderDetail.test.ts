import { readFileSync } from "fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canComplete,
  canManuallyAssign,
  canRetryAssignment,
  canSendCustomerInputSms,
  getSmsDeliveryStatusView,
  getSmsNotificationAction,
  formatStatusTransition,
  groupEquivalentStatusEvents,
  formatOperationalMessage,
  formatStatusEventActorMeta,
  CandidateRunHistory,
  ManualAssignmentInstallerSelector,
  filterManualAssignmentInstallers,
  sortByCreatedAtDesc,
} from "./InstallationOrderDetail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../actions", () => ({
  approveInstallationAssignmentAction: vi.fn(),
  cancelInstallationOrderAction: vi.fn(),
  completeInstallationOrderAction: vi.fn(),
  createManualInstallationAssignmentAction: vi.fn(),
  resolveInstallationIssueAction: vi.fn(),
  retryInstallationOrderAssignmentByAdminAction: vi.fn(),
  retrySmsNotificationAction: vi.fn(),
  sendCustomerInputSmsForInstallationOrdersAction: vi.fn(),
  switchInstallationOrderToManualRequiredAction: vi.fn(),
}));

const candidates = [
  {
    rank: 1,
    installerId: "installer-1",
    installerName: "강남/열쇠닥터",
    installerBranch: "강남/열쇠닥터",
    phone: "01012345678",
    region: "서울",
    serviceAreas: ["강남구", "서초구"],
    monthlyDispatchCount: 3,
    matchTier: "PRIMARY",
    hasAqaraHubInventory: true,
  },
  {
    rank: 2,
    installerId: "installer-2",
    installerName: "관악/신우열쇠",
    installerBranch: "관악/신우열쇠",
    phone: "01087654321",
    region: "서울",
    serviceAreas: ["동작구", "관악구"],
    monthlyDispatchCount: 5,
    matchTier: null,
    hasAqaraHubInventory: false,
  },
];

describe("InstallationOrderDetail", () => {
  it("labels the first detail tab as status actions and includes the customer SMS action", () => {
    const source = readFileSync(
      "src/app/backoffice/installations/[installationId]/InstallationOrderDetail.tsx",
      "utf8",
    );

    expect(source).toContain('{ key: "orderStatus", label: "상태 액션" }');
    expect(source).toContain('key: "sendCustomerInputSms"');
    expect(source).toContain('buttonLabel: "문자 발송"');
    expect(source).toContain("기사 후보/배정 확인");
    expect(source).not.toContain('{ key: "orderStatus", label: "주문 진행 상태" }');
  });

  it("uses explicit confirmation labels and primary styling for navigation and operational actions", () => {
    const source = readFileSync(
      "src/app/backoffice/installations/[installationId]/InstallationOrderDetail.tsx",
      "utf8",
    );

    expect(source).toContain('primaryLabel: "상태 액션 확인"');
    expect(source).toContain("기사 후보/배정 확인");
    expect(source.match(/tone: "primary"/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("formats compact source order dates for display", () => {
    const source = readFileSync(
      "src/app/backoffice/installations/[installationId]/InstallationOrderDetail.tsx",
      "utf8",
    );

    expect(source).toContain('value: formatBackofficeDateTime(item.sourceOrderDate)');
    expect(source).not.toContain('value: formatText(item.sourceOrderDate)');
  });

  it("shows delivered SMS notifications as a terminal success state", () => {
    const source = readFileSync(
      "src/app/backoffice/installations/[installationId]/InstallationOrderDetail.tsx",
      "utf8",
    );

    expect(source).toContain('DELIVERED: "도달 완료"');
    expect(source).toContain('value === "SENT" || value === "DELIVERED"');
  });

  it("sorts dated detail lists with the newest item first without mutating the input", () => {
    const items = [
      { id: "oldest", createdAt: "2026-07-14T09:00:00.000Z" },
      { id: "newest", createdAt: "2026-07-16T09:00:00.000Z" },
      { id: "middle", createdAt: "2026-07-15T09:00:00.000Z" },
    ];

    expect(sortByCreatedAtDesc(items).map((item) => item.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
    expect(items.map((item) => item.id)).toEqual(["oldest", "newest", "middle"]);
  });
});

describe("CandidateRunHistory", () => {
  it("shows the latest ten candidate runs first and provides a load-more control", () => {
    const runs = Array.from({ length: 12 }, (_, index) => ({
      id: `run-${index + 1}`,
      reasonCode: null,
      createdAt: `2026-07-16T${String(12 - index).padStart(2, "0")}:00:00.000Z`,
      candidates: [],
    }));

    const html = renderToStaticMarkup(createElement(CandidateRunHistory, { runs }));

    expect(html).toContain("최근 이력 10 / 12건");
    expect(html).toContain("이력 2건 더보기");
    expect(html.match(/기사 후보 찾기/g)).toHaveLength(10);
  });
});

describe("formatOperationalMessage", () => {
  it("translates internal retry and API result codes into Korean labels", () => {
    expect(formatOperationalMessage("DUPLICATE_INSTALLER_REQUEST")).toBe("이미 요청한 기사 중복 선정");
    expect(formatOperationalMessage("SMS_DELIVERY_STATUS_UNCONFIRMED")).toBe("SMS 도달 결과 확인 불가");
    expect(formatOperationalMessage("SMS_SEND_OUTCOME_UNKNOWN: provider timeout")).toBe(
      "SMS 발송 결과 확인 필요: provider timeout",
    );
  });

  it("does not expose an unmapped internal code", () => {
    expect(formatOperationalMessage("NEW_INTERNAL_ERROR_CODE")).toBe("시스템 처리 사유 확인 필요");
  });
});

describe("formatStatusEventActorMeta", () => {
  it("shows an administrator email instead of an internal ID", () => {
    expect(
      formatStatusEventActorMeta({
        actorType: "ADMIN",
        actorEmail: "admin@example.com",
        actorInstallerName: null,
        actorInstallerBranch: null,
        actorInstallerPhone: null,
      }),
    ).toEqual(["처리자: 관리자 admin@example.com"]);
  });

  it("shows installer name, branch, and phone number", () => {
    expect(
      formatStatusEventActorMeta({
        actorType: "INSTALLER",
        actorEmail: null,
        actorInstallerName: "송지용",
        actorInstallerBranch: "지용열쇠",
        actorInstallerPhone: "01091703550",
      }),
    ).toEqual([
      "처리자: 기사 송지용",
      "소속: 지용열쇠",
      "전화: 010-9170-3550",
    ]);
  });
});

describe("getSmsNotificationAction", () => {
  it("leaves a pending SMS notification for the five-minute cron sender", () => {
    expect(
      getSmsNotificationAction({
        status: "PENDING",
        sentAt: null,
        retryable: false,
        failureReason: null,
        retryCount: 0,
      }),
    ).toEqual({
      kind: null,
      buttonLabel: null,
      loadingLabel: "처리 중",
      eligibilityLabel: "5분 주기 자동 발송 대기",
      failureReason: null,
    });
  });
});

describe("getSmsDeliveryStatusView", () => {
  const baseDelivery = {
    sentAt: "2026-07-16T12:00:00.000Z",
    failureReason: null,
    providerStatus: "COMPLETE",
    providerReason: null,
    providerReportedAt: "2026-07-16T12:00:10.000Z",
    providerCheckedAt: "2026-07-16T12:00:15.000Z",
  };

  it("treats SOLAPI 4000 as delivered", () => {
    expect(getSmsDeliveryStatusView({ ...baseDelivery, providerStatusCode: "4000" })).toEqual({
      label: "도달 성공",
      tone: "success",
      detail: "4000",
    });
  });

  it("does not treat SOLAPI 2000 queued status as delivered", () => {
    expect(getSmsDeliveryStatusView({ ...baseDelivery, providerStatusCode: "2000" })).toEqual({
      label: "조회됨",
      tone: "neutral",
      detail: "2000",
    });
  });
});

describe("operational history presentation", () => {
  it("describes status events without an unknown source as a current-state observation", () => {
    expect(formatStatusTransition(null, "READY_FOR_CANDIDATE_SELECTION")).toBe("현재 상태: 후보 선정 가능");
    expect(formatStatusTransition("WAITING_CUSTOMER_INPUT", "READY_FOR_CANDIDATE_SELECTION")).toBe(
      "고객 입력 대기 → 후보 선정 가능",
    );
  });

  it("groups duplicated system events emitted at the same time", () => {
    const baseEvent = {
      id: "event-1",
      fromStatus: null,
      toStatus: "READY_FOR_CANDIDATE_SELECTION",
      eventType: "INSTALLER_ASSIGNMENT_SMS_SEND_FAILED",
      actorType: "SYSTEM",
      actorEmail: null,
      actorInstallerName: null,
      actorInstallerBranch: null,
      actorInstallerPhone: null,
      reason: "SMS_DELIVERY_FAILED",
      metadata: null,
      createdAt: "2026-07-16T02:15:17.684Z",
    };

    expect(groupEquivalentStatusEvents([baseEvent, { ...baseEvent, id: "event-2" }])).toEqual([
      { event: baseEvent, count: 2 },
    ]);
  });
});

describe("status action guards", () => {
  it("enables customer input SMS only when the order requires it", () => {
    expect(canSendCustomerInputSms("CUSTOMER_INPUT_SMS_REQUIRED")).toBe(true);
    expect(canSendCustomerInputSms("WAITING_CUSTOMER_INPUT")).toBe(false);
    expect(canSendCustomerInputSms("READY_FOR_CANDIDATE_SELECTION")).toBe(false);
  });

  it("enables completion only after an installer is assigned", () => {
    expect(canComplete("INSTALLER_ASSIGNED")).toBe(true);
    expect(canComplete("CUSTOMER_INPUT_SMS_REQUIRED")).toBe(false);
    expect(canComplete("READY_FOR_CANDIDATE_SELECTION")).toBe(false);
    expect(canComplete("WAITING_INSTALLER_RESPONSE")).toBe(false);
    expect(canComplete("COMPLETED")).toBe(false);
  });

  it("allows manual assignment in pre-dispatch states without requiring an open issue", () => {
    expect(canManuallyAssign("READY_FOR_CANDIDATE_SELECTION", true)).toBe(true);
    expect(canManuallyAssign("READY_FOR_CANDIDATE_SELECTION", false)).toBe(true);
    expect(canManuallyAssign("WAITING_ADMIN_REVIEW", false)).toBe(true);
    expect(canRetryAssignment("WAITING_INSTALLER_RESPONSE", true)).toBe(true);
    expect(canManuallyAssign("CUSTOMER_INPUT_SMS_REQUIRED", true)).toBe(false);
    expect(canRetryAssignment("WAITING_CUSTOMER_INPUT", true)).toBe(false);
  });

  it("enables manual assignment for fallback orders even without an open issue", () => {
    expect(canManuallyAssign("WAITING_INSTALLER_RESPONSE", false, true)).toBe(true);
    expect(canManuallyAssign("CUSTOMER_INPUT_SMS_REQUIRED", false, true)).toBe(false);
  });
});

describe("ManualAssignmentInstallerSelector", () => {
  it("renders manual assignment as a selectable installer list instead of a free text installer id field", () => {
    const html = renderToStaticMarkup(
      createElement(ManualAssignmentInstallerSelector, {
        candidates,
        disabled: false,
        selectedInstallerId: "installer-1",
        onSelectInstaller: vi.fn(),
      }),
    );

    expect(html).toContain("설치 기사 선택");
    expect(html).toContain("강남/열쇠닥터");
    expect(html).toContain("010-1234-5678");
    expect(html).toContain("강남구, 서초구");
    expect(html).toContain('type="radio"');
    expect(html).not.toContain("기사 사업자번호 또는 ID");
    expect(html).not.toContain('type="text"');
  });

  it("renders search, filter, and sort controls for large installer lists", () => {
    const html = renderToStaticMarkup(
      createElement(ManualAssignmentInstallerSelector, {
        candidates,
        disabled: false,
        selectedInstallerId: "installer-1",
        onSelectInstaller: vi.fn(),
      }),
    );

    expect(html).toContain("기사명, 전화, 지역 검색");
    expect(html).toContain("지역 매칭만");
    expect(html).toContain("허브 보유만");
    expect(html).toContain("지역 매칭 우선");
    expect(html).toContain("월 배정 적은 순");
  });

  it("filters installers by keyword and optional assignment constraints", () => {
    expect(
      filterManualAssignmentInstallers(candidates, {
        query: "관악",
        matchOnly: false,
        hubOnly: false,
        sort: "recommended",
      }).map((candidate) => candidate.installerId),
    ).toEqual(["installer-2"]);

    expect(
      filterManualAssignmentInstallers(candidates, {
        query: "",
        matchOnly: true,
        hubOnly: true,
        sort: "recommended",
      }).map((candidate) => candidate.installerId),
    ).toEqual(["installer-1"]);
  });

  it("sorts matched installers first, then lower monthly dispatch count", () => {
    const sorted = filterManualAssignmentInstallers(
      [
        { ...candidates[0], installerId: "installer-1", monthlyDispatchCount: 8, matchTier: "PRIMARY" },
        { ...candidates[1], installerId: "installer-2", monthlyDispatchCount: 1, matchTier: null },
        { ...candidates[0], installerId: "installer-3", monthlyDispatchCount: 2, matchTier: "PRIMARY" },
      ],
      {
        query: "",
        matchOnly: false,
        hubOnly: false,
        sort: "recommended",
      },
    );

    expect(sorted.map((candidate) => candidate.installerId)).toEqual([
      "installer-3",
      "installer-1",
      "installer-2",
    ]);
  });
});
