import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getInstallationOrderStatusDetail } from "@/lib/installation/orders/views/detail";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrder: {
      findUnique,
    },
  },
}));

describe("getInstallationOrderStatusDetail", () => {
  it("derives dispatch requirements from the stored source memo for detail candidate filtering", async () => {
    findUnique.mockResolvedValue({
      id: "order-1",
      source: {
        sourceKey: "SO20260611001",
        customerNameEncrypted: null,
        phoneEncrypted: null,
        addressEncrypted: null,
        dueDate: "20260616",
        orderNumbers: "EXT-1",
        noGirl: "GIR-1",
        memo: "[스마트홈 여름 준비 패키지_앱+허브 설치] 용역 도어락 설치비(L100)+월패드 연동(RF447) x1",
      },
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeCustomerRequestId: null,
      activeAssignmentId: null,
      currentInstallerId: null,
      hasOpenIssue: false,
      lastIssueId: null,
      statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      customerRequests: [],
      assignmentAttempts: [],
      statusEvents: [],
      issues: [],
      notifications: [],
      candidateRuns: [],
    });

    const detail = await getInstallationOrderStatusDetail("order-1");

    expect(detail).toMatchObject({
      requiredCapabilities: JSON.stringify(["DOORLOCK", "WALLPAD_HUB"]),
      requiredAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
    });
    expect(prisma.installationOrder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order-1" } }),
    );
  });
});
