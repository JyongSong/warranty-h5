import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallationIssueResolveError, resolveInstallationIssue } from "@/lib/installation/orders/issues/resolve";

const {
  transaction,
  findUniqueIssue,
  updateIssue,
  countIssues,
  updateOrder,
  createStatusEvent,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUniqueIssue: vi.fn(),
  updateIssue: vi.fn(),
  countIssues: vi.fn(),
  updateOrder: vi.fn(),
  createStatusEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
  },
}));

function createTx() {
  return {
    installationIssue: {
      findUnique: findUniqueIssue,
      update: updateIssue,
      count: countIssues,
    },
    installationOrder: {
      update: updateOrder,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  };
}

describe("resolveInstallationIssue", () => {
  beforeEach(() => {
    transaction.mockReset();
    findUniqueIssue.mockReset();
    updateIssue.mockReset();
    countIssues.mockReset();
    updateOrder.mockReset();
    createStatusEvent.mockReset();

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("resolves an open issue and clears the order open issue flag when no open issues remain", async () => {
    const now = new Date("2026-06-18T02:00:00.000Z");
    findUniqueIssue.mockResolvedValue({
      id: "issue-1",
      installationOrderId: "order-1",
      status: "OPEN",
      title: "SMS 발송 실패",
      installationOrder: {
        id: "order-1",
        status: "CUSTOMER_INPUT_PENDING",
      },
    });
    updateIssue.mockResolvedValue({ id: "issue-1", status: "RESOLVED" });
    countIssues.mockResolvedValue(0);

    const result = await resolveInstallationIssue("issue-1", {
      adminId: "admin-1",
      note: "고객에게 전화로 안내 완료",
      now,
    });

    expect(result).toEqual({ id: "issue-1", status: "RESOLVED" });
    expect(updateIssue).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: {
        status: "RESOLVED",
        resolvedByAdminId: "admin-1",
        resolvedAt: now,
        resolutionNote: "고객에게 전화로 안내 완료",
        updatedAt: now,
      },
      select: {
        id: true,
        status: true,
      },
    });
    expect(countIssues).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        status: "OPEN",
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { hasOpenIssue: false },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: "CUSTOMER_INPUT_PENDING",
        toStatus: "CUSTOMER_INPUT_PENDING",
        eventType: "ISSUE_RESOLVED",
        actorType: "ADMIN",
        actorId: "admin-1",
        reason: "고객에게 전화로 안내 완료",
        metadata: {
          issueId: "issue-1",
          issueTitle: "SMS 발송 실패",
        },
        createdAt: now,
      },
    });
  });

  it("keeps the order open issue flag when another open issue remains", async () => {
    findUniqueIssue.mockResolvedValue({
      id: "issue-1",
      installationOrderId: "order-1",
      status: "OPEN",
      title: "SMS 발송 실패",
      installationOrder: {
        id: "order-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
      },
    });
    updateIssue.mockResolvedValue({ id: "issue-1", status: "RESOLVED" });
    countIssues.mockResolvedValue(1);

    await resolveInstallationIssue("issue-1", {
      adminId: "admin-1",
      note: "처리 완료",
    });

    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("requires a resolution note", async () => {
    await expect(
      resolveInstallationIssue("issue-1", {
        adminId: "admin-1",
        note: " ",
      }),
    ).rejects.toThrow(new InstallationIssueResolveError("RESOLUTION_NOTE_REQUIRED"));

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects already resolved issues", async () => {
    findUniqueIssue.mockResolvedValue({
      id: "issue-1",
      installationOrderId: "order-1",
      status: "RESOLVED",
      title: "SMS 발송 실패",
      installationOrder: {
        id: "order-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
      },
    });

    await expect(
      resolveInstallationIssue("issue-1", {
        adminId: "admin-1",
        note: "처리 완료",
      }),
    ).rejects.toThrow(new InstallationIssueResolveError("ISSUE_ALREADY_RESOLVED"));

    expect(updateIssue).not.toHaveBeenCalled();
  });
});
