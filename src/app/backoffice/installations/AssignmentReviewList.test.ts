import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AssignmentReviewList, { type InstallationAssignmentReviewItem } from "./AssignmentReviewList";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("./actions", () => ({
  approveInstallationAssignmentAction: vi.fn(),
  approveInstallationAssignmentsAction: vi.fn(),
}));

function createItem(overrides: Partial<InstallationAssignmentReviewItem> = {}): InstallationAssignmentReviewItem {
  return {
    id: "assignment-1",
    orderId: "order-1",
    customerRequestId: "request-1",
    installerId: "installer-1",
    installerName: "송지용",
    installerPhone: "01091703550",
    assignmentSource: "AUTO",
    matchTier: "SEOUL",
    candidateRank: 1,
    createdAt: "2026-07-10T09:00:00.000Z",
    order: {
      erpOrderNo: "ISU20260700554",
      customerName: "홍길동",
      sourcePhone: "01012345678",
      sourceAddress: "서울 서초구 강남대로53길 8",
      status: "WAITING_ADMIN_REVIEW",
    },
    request: {
      installAddress: "서울 서초구 강남대로53길 8",
      installDate: "2026-07-13",
      installTimeSlot: "오전 09:00 - 12:00",
      customerPhone: "01091703550",
      customerNote: null,
      fallbackUsed: false,
      status: "SUBMITTED",
    },
    ...overrides,
  };
}

describe("AssignmentReviewList", () => {
  it("shows selection controls and bulk approval for waiting assignments", () => {
    const firstOrder = createItem().order;
    const html = renderToStaticMarkup(
      createElement(AssignmentReviewList, {
        initialItems: [
          createItem(),
          createItem({
            id: "assignment-2",
            installerId: "installer-2",
            order: {
              ...firstOrder,
              erpOrderNo: "ISU20260700555",
            },
          }),
        ],
      }),
    );

    expect(html).toContain("선택 일괄 승인 (0)");
    expect(html).toContain('aria-label="승인 대기 배정 전체 선택"');
    expect(html).toContain('aria-label="ISU20260700554 배정 선택"');
    expect(html).toContain('aria-label="ISU20260700555 배정 선택"');
  });
});
