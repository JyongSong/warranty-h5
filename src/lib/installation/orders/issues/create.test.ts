import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";

const { findIssue, createIssue, updateIssue, updateOrder } = vi.hoisted(() => ({
  findIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationIssue: {
      findFirst: findIssue,
      create: createIssue,
      update: updateIssue,
    },
    installationOrder: {
      update: updateOrder,
    },
  },
}));

describe("createInstallationIssue", () => {
  beforeEach(() => {
    findIssue.mockReset();
    createIssue.mockReset();
    updateIssue.mockReset();
    updateOrder.mockReset();
  });

  it("creates a new open issue and marks the order as having an open issue", async () => {
    const now = new Date("2026-06-11T04:00:00.000Z");
    findIssue.mockResolvedValue(null);
    createIssue.mockResolvedValue({ id: "issue-1" });
    updateOrder.mockResolvedValue({ id: "order-1" });

    const result = await createInstallationIssue({
      installationOrderId: "order-1",
      type: "INSTALLER_CANDIDATE_NOT_FOUND",
      title: "후보 기사 없음",
      description: "조건에 맞는 후보 기사가 없습니다.",
      metadata: { customerRequestId: "request-1" },
      now,
    });

    expect(result).toEqual({ id: "issue-1" });
    expect(findIssue).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        status: "OPEN",
      },
      select: { id: true },
    });
    expect(createIssue).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        title: "후보 기사 없음",
        description: "조건에 맞는 후보 기사가 없습니다.",
        metadata: { customerRequestId: "request-1" },
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });
  });

  it("updates the existing open issue when one already exists", async () => {
    const now = new Date("2026-06-11T04:00:00.000Z");
    findIssue.mockResolvedValue({ id: "issue-1" });
    updateIssue.mockResolvedValue({ id: "issue-1" });
    updateOrder.mockResolvedValue({ id: "order-1" });

    const result = await createInstallationIssue({
      installationOrderId: "order-1",
      type: "INSTALLER_CANDIDATE_NOT_FOUND",
      title: "후보 기사 없음",
      description: "조건에 맞는 후보 기사가 없습니다.",
      metadata: { customerRequestId: "request-1" },
      now,
    });

    expect(result).toEqual({ id: "issue-1" });
    expect(updateIssue).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: {
        title: "후보 기사 없음",
        description: "조건에 맞는 후보 기사가 없습니다.",
        metadata: { customerRequestId: "request-1" },
        updatedAt: now,
      },
      select: { id: true },
    });
    expect(createIssue).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });
  });
});
