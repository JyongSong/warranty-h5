import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertOrphanedInstallationOrders,
  alertDueSoonUnassignedOrders,
  timeoutExpiredInstallerAssignments,
} from "@/lib/installation/installer/guards";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { respondInstallerAssignment } from "@/lib/installation/installer/response";
import { decryptPii, encryptPii } from "@/lib/piiCrypto";

const { findManyAssignments, findManyOrders, upsertNotification } = vi.hoisted(() => ({
  findManyAssignments: vi.fn(),
  findManyOrders: vi.fn(),
  upsertNotification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationInstallerAssignmentAttempt: {
      findMany: findManyAssignments,
    },
    installationOrder: {
      findMany: findManyOrders,
    },
    installationNotification: {
      upsert: upsertNotification,
    },
  },
}));

vi.mock("@/lib/installation/installer/response", () => ({
  respondInstallerAssignment: vi.fn(),
}));

vi.mock("@/lib/installation/orders/issues/create", () => ({
  createInstallationIssue: vi.fn(),
}));

const respondInstallerAssignmentMock = vi.mocked(respondInstallerAssignment);
const createInstallationIssueMock = vi.mocked(createInstallationIssue);

describe("installation dispatch guards", () => {
  beforeEach(() => {
    findManyAssignments.mockReset();
    findManyOrders.mockReset();
    upsertNotification.mockReset();
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    respondInstallerAssignmentMock.mockReset();
    createInstallationIssueMock.mockReset();
  });

  it("times out dispatched assignments whose installer token expired", async () => {
    const now = new Date("2026-06-11T05:00:00.000Z");
    findManyAssignments.mockResolvedValue([
      {
        id: "assignment-1",
        installationOrderId: "order-1",
        installerTokenHash: "hashed-token",
      },
    ]);
    respondInstallerAssignmentMock.mockResolvedValue(undefined);

    const result = await timeoutExpiredInstallerAssignments({ now, limit: 10 });

    expect(result).toEqual({ timedOutCount: 1, failedCount: 0 });
    expect(findManyAssignments).toHaveBeenCalledWith({
      where: {
        status: "WAITING_INSTALLER_RESPONSE",
        installerTokenExpiresAt: { lt: now },
      },
      orderBy: { installerTokenExpiresAt: "asc" },
      take: 10,
      select: {
        id: true,
        installationOrderId: true,
        installerTokenHash: true,
        installer: { select: { phone: true } },
        customerRequest: { select: { installAddress1Encrypted: true } },
      },
    });
    expect(respondInstallerAssignmentMock).toHaveBeenCalledWith("hashed-token", {
      response: "REJECT",
      rejectReason: "INSTALLER_RESPONSE_TIMEOUT",
      now,
      tokenIsHash: true,
    });
  });

  it("queues a cancel notice for the timed-out installer instead of sending it right away", async () => {
    const now = new Date("2026-06-11T17:00:00.000Z"); // 02:00 KST
    findManyAssignments.mockResolvedValue([
      {
        id: "assignment-1",
        installationOrderId: "order-1",
        installerTokenHash: "hashed-token",
        installer: { phone: "010-1111-2222" },
        customerRequest: { installAddress1Encrypted: encryptPii("서울 강남구 테헤란로 1") },
      },
    ]);
    respondInstallerAssignmentMock.mockResolvedValue(undefined);

    await timeoutExpiredInstallerAssignments({ now, limit: 10 });

    expect(upsertNotification).toHaveBeenCalledWith({
      where: { idempotencyKey: "installer-assignment-timeout:assignment-1" },
      create: expect.objectContaining({
        installationOrderId: "order-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_TIMEOUT",
        recipientType: "INSTALLER",
        status: "PENDING",
        smsBody: expect.stringContaining("서울 강남구 테헤란로 1"),
      }),
      update: {},
    });
    const created = upsertNotification.mock.calls[0][0].create;
    expect(decryptPii(created.recipientPhoneEncrypted)).toBe("01011112222");
  });

  it("keeps the timeout even when the cancel notice cannot be queued", async () => {
    const now = new Date("2026-06-11T05:00:00.000Z");
    findManyAssignments.mockResolvedValue([
      {
        id: "assignment-1",
        installationOrderId: "order-1",
        installerTokenHash: "hashed-token",
        installer: { phone: "010-1111-2222" },
        customerRequest: null,
      },
    ]);
    respondInstallerAssignmentMock.mockResolvedValue(undefined);
    upsertNotification.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(timeoutExpiredInstallerAssignments({ now, limit: 10 })).resolves.toEqual({
      timedOutCount: 1,
      failedCount: 0,
    });
    expect(createInstallationIssueMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("opens an admin issue when timeout processing fails", async () => {
    const now = new Date("2026-06-11T05:00:00.000Z");
    findManyAssignments.mockResolvedValue([
      {
        id: "assignment-1",
        installationOrderId: "order-1",
        installerTokenHash: "hashed-token",
      },
    ]);
    respondInstallerAssignmentMock.mockRejectedValue(new Error("timeout transition failed"));
    createInstallationIssueMock.mockResolvedValue({ id: "issue-1" });

    await expect(timeoutExpiredInstallerAssignments({ now })).resolves.toEqual({
      timedOutCount: 0,
      failedCount: 1,
    });
    expect(createInstallationIssueMock).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "INSTALLATION_AUTOMATION_FAILED",
      title: "기사 응답 timeout 처리 실패",
      description: "timeout transition failed",
      metadata: {
        stage: "INSTALLER_RESPONSE_TIMEOUT",
        assignmentId: "assignment-1",
      },
      now,
    });
  });

  it("opens an admin issue for a stale installer wait without a valid deadline", async () => {
    const now = new Date("2026-06-11T05:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        status: "WAITING_INSTALLER_RESPONSE",
        activeAssignmentId: "assignment-1",
        activeAssignment: {
          id: "assignment-1",
          status: "WAITING_INSTALLER_RESPONSE",
          installerTokenExpiresAt: null,
          notifications: [{ id: "notification-1", status: "SENT" }],
        },
      },
    ]);
    createInstallationIssueMock.mockResolvedValue({ id: "issue-1" });

    await expect(alertOrphanedInstallationOrders({ now, limit: 10 })).resolves.toEqual({
      issueCount: 1,
    });
    expect(createInstallationIssueMock).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "INSTALLATION_WORKFLOW_ORPHANED",
      title: "설치 업무 흐름 중단 감지",
      description: "기사 응답 대기 상태에 유효한 배정 요청 또는 종료 시각이 없어 관리자 확인이 필요합니다.",
      metadata: {
        status: "WAITING_INSTALLER_RESPONSE",
        activeAssignmentId: "assignment-1",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        notificationId: "notification-1",
        notificationStatus: "SENT",
      },
      now,
    });
  });

  it("does not flag a wait whose assignment request is still queued for sending", async () => {
    const now = new Date("2026-06-11T13:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        status: "WAITING_INSTALLER_RESPONSE",
        activeAssignmentId: "assignment-1",
        activeAssignment: {
          id: "assignment-1",
          status: "WAITING_INSTALLER_RESPONSE",
          installerTokenExpiresAt: null,
          notifications: [{ id: "notification-1", status: "PENDING" }],
        },
      },
    ]);

    await expect(alertOrphanedInstallationOrders({ now, limit: 10 })).resolves.toEqual({
      issueCount: 0,
    });
    expect(createInstallationIssueMock).not.toHaveBeenCalled();
  });

  it("creates due-soon issues for orders due tomorrow after 09:00 KST", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        customerRequests: [{ installDate: "2026-06-12" }],
      },
    ]);
    createInstallationIssueMock.mockResolvedValue({ id: "issue-1" });

    const result = await alertDueSoonUnassignedOrders({ now, limit: 10 });

    expect(result).toEqual({ issueCount: 1 });
    expect(findManyOrders).toHaveBeenCalledWith({
      where: {
        status: {
          in: ["READY_FOR_CANDIDATE_SELECTION", "WAITING_ADMIN_REVIEW", "WAITING_INSTALLER_RESPONSE"],
        },
        customerRequests: {
          some: {
            status: { in: ["SUBMITTED", "FALLBACK_USED"] },
            installDate: { lte: "2026-06-12" },
          },
        },
      },
      orderBy: { statusChangedAt: "asc" },
      take: 10,
      select: expect.any(Object),
    });
    expect(createInstallationIssueMock).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "INSTALLER_NOT_ASSIGNED",
      title: "설치 일정 임박",
      description: "설치 희망일 전까지 기사 배정 또는 완료가 확정되지 않았습니다.",
      metadata: {
        installDate: "2026-06-12",
        status: "READY_FOR_CANDIDATE_SELECTION",
      },
      now,
    });
  });

  it("does not advance the due-soon threshold before 09:00 KST", async () => {
    const now = new Date("2026-06-10T23:59:00.000Z");
    findManyOrders.mockResolvedValue([]);

    await alertDueSoonUnassignedOrders({ now, limit: 10 });

    expect(findManyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerRequests: {
            some: {
              status: { in: ["SUBMITTED", "FALLBACK_USED"] },
              installDate: { lte: "2026-06-11" },
            },
          },
        }),
      }),
    );
  });
});
