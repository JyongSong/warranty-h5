import { readFileSync } from "fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canComplete,
  canManuallyAssign,
  canRetryAssignment,
  getSmsNotificationAction,
  ManualAssignmentInstallerSelector,
  filterManualAssignmentInstallers,
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
  it("formats compact source order dates for display", () => {
    const source = readFileSync(
      "src/app/backoffice/installations/[installationId]/InstallationOrderDetail.tsx",
      "utf8",
    );

    expect(source).toContain('value: formatBackofficeDateTime(item.sourceOrderDate)');
    expect(source).not.toContain('value: formatText(item.sourceOrderDate)');
  });
});

describe("getSmsNotificationAction", () => {
  it("allows a pending SMS notification to be sent manually", () => {
    expect(
      getSmsNotificationAction({
        status: "PENDING",
        sentAt: null,
        retryable: false,
        failureReason: null,
        retryCount: 0,
      }),
    ).toEqual({
      kind: "send",
      buttonLabel: "발송",
      loadingLabel: "발송 중",
      eligibilityLabel: null,
      failureReason: null,
    });
  });
});

describe("status action guards", () => {
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
