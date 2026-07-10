import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  approveInstallationAssignmentByAdmin,
  retryInstallationOrderAssignmentByAdmin,
} from "@/lib/installation/installer/dispatch";
import {
  cancelInstallationOrder,
  completeInstallationOrder,
  createManualInstallerAssignment,
  InstallationManualOperationError,
  switchInstallationOrderToManualRequired,
} from "@/lib/installation/installer/manual-operations";
import { InstallationIssueResolveError, resolveInstallationIssue } from "@/lib/installation/orders/issues/resolve";
import {
  retrySmsNotification,
  sendInstallationNotificationById,
} from "@/lib/installation/notifications/outbox";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import { createCustomerInputRequestsForInstallationOrders } from "@/lib/installation/orders/processor";
import {
  cancelInstallationOrderAction,
  completeInstallationOrderAction,
  createManualInstallationAssignmentAction,
  sendCustomerInputSmsForInstallationOrdersAction,
  approveInstallationAssignmentAction,
  approveInstallationAssignmentsAction,
  resolveInstallationIssueAction,
  retryInstallationOrderAssignmentByAdminAction,
  retrySmsNotificationAction,
  sendSmsNotificationAction,
  switchInstallationOrderToManualRequiredAction,
} from "./actions";

vi.mock("@/lib/login/backofficeAuth", () => ({
  getCurrentBackofficeUser: vi.fn(),
}));

vi.mock("@/lib/installation/installer/dispatch", () => ({
  InstallationDispatchError: class InstallationDispatchError extends Error {},
  approveInstallationAssignmentByAdmin: vi.fn(),
  retryInstallationOrderAssignmentByAdmin: vi.fn(),
}));

vi.mock("@/lib/installation/installer/manual-operations", () => ({
  InstallationManualOperationError: class InstallationManualOperationError extends Error {},
  cancelInstallationOrder: vi.fn(),
  completeInstallationOrder: vi.fn(),
  createManualInstallerAssignment: vi.fn(),
  switchInstallationOrderToManualRequired: vi.fn(),
}));

vi.mock("@/lib/installation/orders/issues/resolve", () => ({
  InstallationIssueResolveError: class InstallationIssueResolveError extends Error {},
  resolveInstallationIssue: vi.fn(),
}));

vi.mock("@/lib/installation/notifications/outbox", () => ({
  retrySmsNotification: vi.fn(),
  sendInstallationNotificationById: vi.fn(),
}));

vi.mock("@/lib/installation/notifications/sms-link-base-url", () => ({
  getSmsLinkBaseUrl: vi.fn(),
}));

vi.mock("@/lib/installation/orders/processor", () => ({
  createCustomerInputRequestsForInstallationOrders: vi.fn(),
}));

const getCurrentBackofficeUserMock = vi.mocked(getCurrentBackofficeUser);
const getSmsLinkBaseUrlMock = vi.mocked(getSmsLinkBaseUrl);
const cancelInstallationOrderMock = vi.mocked(cancelInstallationOrder);
const completeInstallationOrderMock = vi.mocked(completeInstallationOrder);
const createManualInstallerAssignmentMock = vi.mocked(createManualInstallerAssignment);
const switchInstallationOrderToManualRequiredMock = vi.mocked(switchInstallationOrderToManualRequired);
const approveInstallationAssignmentByAdminMock = vi.mocked(approveInstallationAssignmentByAdmin);
const retryInstallationOrderAssignmentByAdminMock = vi.mocked(retryInstallationOrderAssignmentByAdmin);
const retrySmsNotificationMock = vi.mocked(retrySmsNotification);
const sendInstallationNotificationByIdMock = vi.mocked(sendInstallationNotificationById);
const createCustomerInputRequestsForInstallationOrdersMock = vi.mocked(createCustomerInputRequestsForInstallationOrders);
const resolveInstallationIssueMock = vi.mocked(resolveInstallationIssue);

describe("installation order management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-user-1",
      email: "admin@example.com",
      level: 1,
    });
    getSmsLinkBaseUrlMock.mockReturnValue("https://example.com");
  });

  it("creates a manual installer assignment for an authorized admin", async () => {
    createManualInstallerAssignmentMock.mockResolvedValue({
      assignmentId: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeAttempt: {
        id: "assignment-1",
        assignmentType: "MANUAL_DIRECT",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    });

    const result = await createManualInstallationAssignmentAction({
      installationId: "order-1",
      installerId: "installer-1",
      manualReason: "지역 예외",
    });

    expect(result).toEqual({
      ok: true,
      assignmentId: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeAttempt: {
        id: "assignment-1",
        assignmentType: "MANUAL_DIRECT",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    });
    expect(createManualInstallerAssignmentMock).toHaveBeenCalledWith("order-1", {
      installerId: "installer-1",
      adminId: "admin-1",
      manualReason: "지역 예외",
      baseUrl: "https://example.com",
    });
  });

  it("approves a candidate assignment for an authorized admin", async () => {
    approveInstallationAssignmentByAdminMock.mockResolvedValue({
      assignmentId: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeAttempt: {
        id: "assignment-1",
        assignmentType: "AUTO",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    });

    const result = await approveInstallationAssignmentAction({
      assignmentId: "assignment-1",
    });

    expect(result).toEqual({
      ok: true,
      assignmentId: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeAttempt: {
        id: "assignment-1",
        assignmentType: "AUTO",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    });
    expect(approveInstallationAssignmentByAdminMock).toHaveBeenCalledWith("assignment-1", {
      adminId: "admin-1",
      baseUrl: "https://example.com",
    });
  });

  it("approves multiple candidate assignments for an authorized admin", async () => {
    approveInstallationAssignmentByAdminMock.mockResolvedValue({
      assignmentId: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeAttempt: null,
    });

    const result = await approveInstallationAssignmentsAction({
      assignmentIds: [" assignment-1 ", "assignment-2", "assignment-1"],
    });

    expect(result).toEqual({
      ok: true,
      approvedCount: 2,
      failedCount: 0,
      failures: [],
    });
    expect(approveInstallationAssignmentByAdminMock).toHaveBeenCalledTimes(2);
    expect(approveInstallationAssignmentByAdminMock).toHaveBeenNthCalledWith(1, "assignment-1", {
      adminId: "admin-1",
      baseUrl: "https://example.com",
    });
    expect(approveInstallationAssignmentByAdminMock).toHaveBeenNthCalledWith(2, "assignment-2", {
      adminId: "admin-1",
      baseUrl: "https://example.com",
    });
  });

  it("reports partial failures while bulk approving candidate assignments", async () => {
    approveInstallationAssignmentByAdminMock
      .mockResolvedValueOnce({
        assignmentId: "assignment-1",
        status: "WAITING_INSTALLER_RESPONSE",
        activeAttempt: null,
      })
      .mockRejectedValueOnce(new Error("database error"));

    const result = await approveInstallationAssignmentsAction({
      assignmentIds: ["assignment-1", "assignment-2"],
    });

    expect(result).toEqual({
      ok: true,
      approvedCount: 1,
      failedCount: 1,
      failures: [{ assignmentId: "assignment-2", error: "ASSIGNMENT_APPROVAL_FAILED" }],
    });
  });

  it("requires at least one assignment for bulk candidate approval", async () => {
    const result = await approveInstallationAssignmentsAction({
      assignmentIds: [" ", ""],
    });

    expect(result).toEqual({ ok: false, error: "ASSIGNMENT_IDS_REQUIRED" });
    expect(approveInstallationAssignmentByAdminMock).not.toHaveBeenCalled();
  });

  it.each([
    ["ORDER_NOT_MANUAL_ASSIGNABLE", "INSTALLATION_NOT_ATTENTION_REQUIRED"],
    ["INSTALLER_NOT_ACTIVE", "INSTALLER_INACTIVE"],
    ["INSTALLER_CAPABILITY_NOT_MATCHED", "INSTALLER_CAPABILITY_NOT_MET"],
    ["INSTALLER_AQARA_CAPABILITY_NOT_MATCHED", "AQARA_APP_CAPABILITY_NOT_MET"],
    ["MANUAL_ASSIGNMENT_REASON_REQUIRED", "MANUAL_REASON_REQUIRED_FOR_REGION_MISMATCH"],
    ["DUPLICATE_INSTALLER_REQUEST", "DUPLICATE_INSTALLER_REQUEST"],
  ])("maps manual assignment error %s to public contract error %s", async (internalError, publicError) => {
    createManualInstallerAssignmentMock.mockRejectedValue(
      new InstallationManualOperationError(internalError),
    );

    const result = await createManualInstallationAssignmentAction({
      installationId: "order-1",
      installerId: "installer-1",
    });

    expect(result).toEqual({ ok: false, error: publicError });
  });

  it("cancels an installation order for an authorized admin", async () => {
    cancelInstallationOrderMock.mockResolvedValue(undefined);

    const result = await cancelInstallationOrderAction({
      installationId: "order-1",
      reason: "고객 요청 취소",
    });

    expect(result).toEqual({ ok: true, status: "CANCELLED" });
    expect(cancelInstallationOrderMock).toHaveBeenCalledWith("order-1", {
      adminId: "admin-1",
      reason: "고객 요청 취소",
    });
  });

  it("switches an installation order to manual required for an authorized admin", async () => {
    switchInstallationOrderToManualRequiredMock.mockResolvedValue(undefined);

    const result = await switchInstallationOrderToManualRequiredAction({
      installationId: "order-1",
      reason: "자동 진행 중단",
    });

    expect(result).toEqual({ ok: true, status: "ATTENTION_REQUIRED" });
    expect(switchInstallationOrderToManualRequiredMock).toHaveBeenCalledWith("order-1", {
      adminId: "admin-1",
      reason: "자동 진행 중단",
    });
  });

  it("completes an installation order for an authorized admin", async () => {
    completeInstallationOrderMock.mockResolvedValue(undefined);

    const result = await completeInstallationOrderAction({
      installationId: "order-1",
      reason: "설치 완료 확인",
    });

    expect(result).toEqual({ ok: true, status: "COMPLETED" });
    expect(completeInstallationOrderMock).toHaveBeenCalledWith("order-1", {
      adminId: "admin-1",
      reason: "설치 완료 확인",
    });
  });

  it("retries installer assignment for a manual required order", async () => {
    retryInstallationOrderAssignmentByAdminMock.mockResolvedValue({
      assignmentId: "assignment-2",
      status: "WAITING_ADMIN_REVIEW",
      activeAttempt: {
        id: "assignment-2",
        assignmentType: "ADMIN_RETRY",
        assignmentStatus: "WAITING_ADMIN_REVIEW",
        smsRetryPending: false,
      },
    });

    const result = await retryInstallationOrderAssignmentByAdminAction({
      installationId: "order-1",
    });

    expect(result).toEqual({
      ok: true,
      assignmentId: "assignment-2",
      status: "WAITING_ADMIN_REVIEW",
      activeAttempt: {
        id: "assignment-2",
        assignmentType: "ADMIN_RETRY",
        assignmentStatus: "WAITING_ADMIN_REVIEW",
        smsRetryPending: false,
      },
    });
    expect(retryInstallationOrderAssignmentByAdminMock).toHaveBeenCalledWith("order-1", {
      adminId: "admin-1",
      reason: "관리자 기사 후보 다시 찾기",
      baseUrl: "https://example.com",
    });
  });

  it("queues customer input SMS notifications for selected installation orders", async () => {
    createCustomerInputRequestsForInstallationOrdersMock.mockResolvedValue({
      processedCount: 2,
      skippedAlreadyRequestedCount: 1,
      skippedDuplicateCount: 0,
      skippedInvalidStateCount: 1,
      failedCount: 0,
    });

    const result = await sendCustomerInputSmsForInstallationOrdersAction({
      installationIds: [" order-1 ", "order-2", "order-1"],
    });

    expect(result).toEqual({
      ok: true,
      processedCount: 2,
      skippedAlreadyRequestedCount: 1,
      skippedDuplicateCount: 0,
      skippedInvalidStateCount: 1,
      failedCount: 0,
    });
    expect(createCustomerInputRequestsForInstallationOrdersMock).toHaveBeenCalledWith({
      orderIds: ["order-1", "order-2"],
      baseUrl: "https://example.com",
    });
  });

  it("requires at least one installation order for manual customer input SMS", async () => {
    const result = await sendCustomerInputSmsForInstallationOrdersAction({
      installationIds: [" ", ""],
    });

    expect(result).toEqual({ ok: false, error: "ORDER_IDS_REQUIRED" });
    expect(createCustomerInputRequestsForInstallationOrdersMock).not.toHaveBeenCalled();
  });

  it("marks a failed SMS notification pending for retry", async () => {
    retrySmsNotificationMock.mockResolvedValue({ id: "notification-1", status: "PENDING" });

    const result = await retrySmsNotificationAction("notification-1");

    expect(result).toEqual({ ok: true, notificationId: "notification-1", status: "PENDING" });
    expect(retrySmsNotificationMock).toHaveBeenCalledWith("notification-1");
  });

  it("sends a pending SMS notification immediately for a manual admin send", async () => {
    sendInstallationNotificationByIdMock.mockResolvedValue({ id: "notification-1", status: "SENT" });

    const result = await sendSmsNotificationAction("notification-1");

    expect(result).toEqual({ ok: true, notificationId: "notification-1", status: "SENT" });
    expect(sendInstallationNotificationByIdMock).toHaveBeenCalledWith("notification-1");
  });

  it("resolves an installation issue for an authorized admin", async () => {
    resolveInstallationIssueMock.mockResolvedValue({ id: "issue-1", status: "RESOLVED" });

    const result = await resolveInstallationIssueAction({
      issueId: " issue-1 ",
      note: " 고객에게 전화 안내 완료 ",
    });

    expect(result).toEqual({ ok: true, issueId: "issue-1", status: "RESOLVED" });
    expect(resolveInstallationIssueMock).toHaveBeenCalledWith("issue-1", {
      adminId: "admin-1",
      note: "고객에게 전화 안내 완료",
    });
  });

  it("requires a note when resolving an installation issue", async () => {
    const result = await resolveInstallationIssueAction({
      issueId: "issue-1",
      note: " ",
    });

    expect(result).toEqual({ ok: false, error: "RESOLUTION_NOTE_REQUIRED" });
    expect(resolveInstallationIssueMock).not.toHaveBeenCalled();
  });

  it("returns public installation issue resolve errors", async () => {
    resolveInstallationIssueMock.mockRejectedValue(
      new InstallationIssueResolveError("ISSUE_ALREADY_RESOLVED"),
    );

    const result = await resolveInstallationIssueAction({
      issueId: "issue-1",
      note: "처리 완료",
    });

    expect(result).toEqual({ ok: false, error: "ISSUE_ALREADY_RESOLVED" });
  });

});
