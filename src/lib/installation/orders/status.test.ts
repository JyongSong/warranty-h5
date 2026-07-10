import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";

const { transaction, findUnique, update, updateManyIssues, countIssues, createStatusEvent } = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateManyIssues: vi.fn(),
  countIssues: vi.fn(),
  createStatusEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
  },
}));

function createTx() {
  return {
    installationOrder: {
      findUnique,
      update,
    },
    installationIssue: {
      updateMany: updateManyIssues,
      count: countIssues,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  };
}

describe("transitionInstallationOrderStatus", () => {
  beforeEach(() => {
    transaction.mockReset();
    findUnique.mockReset();
    update.mockReset();
    updateManyIssues.mockReset();
    countIssues.mockReset();
    createStatusEvent.mockReset();

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("exposes only the installation order statuses backed by the Prisma schema", () => {
    expect(Object.values(INSTALLATION_ORDER_STATUSES)).toEqual([
      "CUSTOMER_INPUT_SMS_REQUIRED",
      "WAITING_CUSTOMER_INPUT",
      "READY_FOR_CANDIDATE_SELECTION",
      "WAITING_ADMIN_REVIEW",
      "WAITING_INSTALLER_RESPONSE",
      "INSTALLER_ASSIGNED",
      "CANCELLED",
      "COMPLETED",
    ]);
  });

  it("updates the order status for an allowed customer submission transition", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    update.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });

    await transitionInstallationOrderStatus("order-1", "READY_FOR_CANDIDATE_SELECTION", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("allows orders requiring customer SMS to move to waiting customer input", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });
    update.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });

    await transitionInstallationOrderStatus("order-1", "WAITING_CUSTOMER_INPUT", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "WAITING_CUSTOMER_INPUT",
        statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("rejects transitions that are not in the workflow", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });

    await expect(
      transitionInstallationOrderStatus("order-1", "WAITING_INSTALLER_RESPONSE", {
        now: new Date("2026-06-11T00:00:00.000Z"),
      }),
    ).rejects.toThrow("INVALID_INSTALLATION_ORDER_STATUS_TRANSITION");

    expect(update).not.toHaveBeenCalled();
  });

  it("keeps waiting customer input orders in the same status when opening an issue", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    update.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });

    await transitionInstallationOrderStatus("order-1", "WAITING_CUSTOMER_INPUT", {
      now: new Date("2026-06-11T00:00:00.000Z"),
      orderData: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
        status: "WAITING_CUSTOMER_INPUT",
        statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("allows ready orders to move to admin review", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    update.mockResolvedValue({ id: "order-1", status: "WAITING_ADMIN_REVIEW" });

    await transitionInstallationOrderStatus("order-1", "WAITING_ADMIN_REVIEW", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "WAITING_ADMIN_REVIEW",
        statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("allows ready orders to move directly to installer response for manual assignment", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    update.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });

    await transitionInstallationOrderStatus("order-1", "WAITING_INSTALLER_RESPONSE", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "WAITING_INSTALLER_RESPONSE",
        statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("records an audit event when context includes one", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_ADMIN_REVIEW" });
    update.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });

    await transitionInstallationOrderStatus("order-1", "WAITING_INSTALLER_RESPONSE", {
      now: new Date("2026-06-11T00:00:00.000Z"),
      event: {
        eventType: "INSTALLER_REQUEST_SENT",
        actorType: "ADMIN",
        actorId: "admin-1",
        metadata: { assignmentId: "assignment-1" },
      },
    });

    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: "WAITING_ADMIN_REVIEW",
        toStatus: "WAITING_INSTALLER_RESPONSE",
        eventType: "INSTALLER_REQUEST_SENT",
        actorType: "ADMIN",
        actorId: "admin-1",
        reason: null,
        metadata: { assignmentId: "assignment-1" },
        createdAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("resolves open due-soon issues when the order becomes assigned", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    update.mockResolvedValue({ id: "order-1", status: "INSTALLER_ASSIGNED" });
    updateManyIssues.mockResolvedValue({ count: 1 });
    countIssues.mockResolvedValue(0);

    await transitionInstallationOrderStatus("order-1", "INSTALLER_ASSIGNED", { now });

    expect(updateManyIssues).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        type: "INSTALLER_NOT_ASSIGNED",
        status: "OPEN",
      },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionNote: "설치건 상태가 INSTALLER_ASSIGNED로 전환되어 일정 임박 예외를 해결했습니다.",
        updatedAt: now,
      },
    });
    expect(countIssues).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        status: "OPEN",
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { hasOpenIssue: false },
    });
  });

  it("resolves open candidate blocking issues when the order becomes assigned", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    update.mockResolvedValue({ id: "order-1", status: "INSTALLER_ASSIGNED" });
    updateManyIssues.mockResolvedValue({ count: 1 });
    countIssues.mockResolvedValue(0);

    await transitionInstallationOrderStatus("order-1", "INSTALLER_ASSIGNED", { now });

    expect(updateManyIssues).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        type: {
          in: [
            "INSTALLER_CANDIDATE_NOT_FOUND",
            "INSTALLER_CANDIDATE_EXHAUSTED",
          ],
        },
        status: "OPEN",
      },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionNote: "설치건 상태가 INSTALLER_ASSIGNED로 전환되어 배정 예외를 해결했습니다.",
        updatedAt: now,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { hasOpenIssue: false },
    });
  });

  it("keeps the order open issue flag when resolving due-soon leaves another open issue", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    update.mockResolvedValue({ id: "order-1", status: "INSTALLER_ASSIGNED" });
    updateManyIssues.mockResolvedValue({ count: 1 });
    countIssues.mockResolvedValue(1);

    await transitionInstallationOrderStatus("order-1", "INSTALLER_ASSIGNED", { now });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "INSTALLER_ASSIGNED",
        statusChangedAt: now,
      },
    });
  });

  it("does not resolve due-soon issues on non-terminal progress transitions", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    update.mockResolvedValue({ id: "order-1", status: "WAITING_ADMIN_REVIEW" });

    await transitionInstallationOrderStatus("order-1", "WAITING_ADMIN_REVIEW", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(updateManyIssues).not.toHaveBeenCalled();
  });

  it("allows assigned orders to be cancelled", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "INSTALLER_ASSIGNED" });
    update.mockResolvedValue({ id: "order-1", status: "CANCELLED" });

    await transitionInstallationOrderStatus("order-1", "CANCELLED", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "CANCELLED",
        statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    });
  });

  it("treats completed orders as terminal", async () => {
    findUnique.mockResolvedValue({ id: "order-1", status: "COMPLETED" });

    await expect(
      transitionInstallationOrderStatus("order-1", "CANCELLED", {
        now: new Date("2026-06-11T00:00:00.000Z"),
      }),
    ).rejects.toThrow("INVALID_INSTALLATION_ORDER_STATUS_TRANSITION");

    expect(update).not.toHaveBeenCalled();
  });
});
