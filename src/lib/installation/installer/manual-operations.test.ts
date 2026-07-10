import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelInstallationOrder,
  completeInstallationOrder,
  createManualInstallerAssignment,
  switchInstallationOrderToManualRequired,
} from "@/lib/installation/installer/manual-operations";
import { decryptPii, hmacPii } from "@/lib/piiCrypto";

const {
  transaction,
  findUniqueOrder,
  updateOrder,
  findUniqueInstaller,
  countAssignments,
  createAssignment,
  upsertNotification,
  findUniqueAssignment,
  findFirstAssignment,
  updateAssignment,
  findFirstIssue,
  createIssue,
  updateIssue,
  updateManyIssues,
  countIssues,
  createStatusEvent,
  updateCustomerRequest,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUniqueOrder: vi.fn(),
  updateOrder: vi.fn(),
  findUniqueInstaller: vi.fn(),
  countAssignments: vi.fn(),
  createAssignment: vi.fn(),
  upsertNotification: vi.fn(),
  findUniqueAssignment: vi.fn(),
  findFirstAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  findFirstIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  updateManyIssues: vi.fn(),
  countIssues: vi.fn(),
  createStatusEvent: vi.fn(),
  updateCustomerRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
  },
}));

function createTx() {
  return {
    installationOrder: {
      findUnique: findUniqueOrder,
      update: updateOrder,
    },
    installationCustomerRequest: {
      update: updateCustomerRequest,
    },
    installer: {
      findUnique: findUniqueInstaller,
    },
    installationInstallerAssignmentAttempt: {
      findUnique: findUniqueAssignment,
      findFirst: findFirstAssignment,
      update: updateAssignment,
      count: countAssignments,
      create: createAssignment,
    },
    installationNotification: {
      upsert: upsertNotification,
    },
    installationIssue: {
      findFirst: findFirstIssue,
      create: createIssue,
      update: updateIssue,
      updateMany: updateManyIssues,
      count: countIssues,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  };
}

describe("installation manual operations", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    transaction.mockReset();
    findUniqueOrder.mockReset();
    updateOrder.mockReset();
    findUniqueInstaller.mockReset();
    countAssignments.mockReset();
    createAssignment.mockReset();
    upsertNotification.mockReset();
    findUniqueAssignment.mockReset();
    findFirstAssignment.mockReset();
    updateAssignment.mockReset();
    findFirstIssue.mockReset();
    createIssue.mockReset();
    updateIssue.mockReset();
    updateManyIssues.mockReset();
    countIssues.mockReset();
    createStatusEvent.mockReset();
    updateCustomerRequest.mockReset();
    findFirstIssue.mockResolvedValue(null);
    createIssue.mockResolvedValue({ id: "issue-1" });
    countIssues.mockResolvedValue(0);

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("rejects manual direct assignment from a non-dispatchable order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_CUSTOMER_INPUT",
      hasOpenIssue: false,
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-1",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("ORDER_NOT_MANUAL_ASSIGNABLE");

    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("creates a manual direct assignment from a candidate selection order without an open issue", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: false,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [{ id: "request-1", installAddressEncrypted: "서울 강남구 테헤란로 1" }],
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "서울강남기사",
      branch: "서울강남지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
      region: "서울",
      coverage: null,
      serviceAreas: ["서울 강남구"],
    });
    countAssignments.mockResolvedValue(0);
    createAssignment.mockResolvedValue({ id: "assignment-1" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "manual-token",
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentSource: "MANUAL_DIRECT",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
  });

  it("rejects manual direct assignment from a customer SMS required order even with an open issue", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "CUSTOMER_INPUT_SMS_REQUIRED",
      hasOpenIssue: true,
      activeCustomerRequestId: null,
      activeAssignmentId: null,
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-1",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("ORDER_NOT_MANUAL_ASSIGNABLE");

    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });


  it("creates a manual direct waiting response assignment from an attention-required order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "[잇섭PICK_앱 설치] 용역 도어락 설치비(K100)+월패드 연동(RF447) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [{ id: "request-1", installAddressEncrypted: "서울 강남구 테헤란로 1" }],
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "서울강남기사",
      branch: "서울강남지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK", "WALLPAD_HUB"],
      aqaraAppCapability: "DOORLOCK_AND_APP",
      region: "서울",
      coverage: null,
      serviceAreas: ["서울 강남구"],
    });
    countAssignments.mockResolvedValue(1);
    createAssignment.mockResolvedValue({ id: "assignment-2" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "manual-token",
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentNumber: 2,
        assignmentSource: "MANUAL_DIRECT",
        matchTier: "EXACT_DISTRICT",
        createdByAdminId: "admin-1",
        installerTokenHash:
          "f60295d44a03ab6c9eea856b4dd729bb06b464d0a11e8cb2f5a822ea552014f7",
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
    expect(upsertNotification).toHaveBeenCalledWith({
      where: { idempotencyKey: "installer-assignment-request:assignment-2" },
      create: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentAttemptId: "assignment-2",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientType: "INSTALLER",
        recipientPhoneEncrypted: expect.stringMatching(/^enc:v1:/),
        recipientPhoneHash: hmacPii("01022223333"),
        smsTemplateKey: "installer_assignment_request",
        status: "PENDING",
        idempotencyKey: "installer-assignment-request:assignment-2",
      }),
      update: {},
    });
    expect(decryptPii(upsertNotification.mock.calls[0][0].create.recipientPhoneEncrypted)).toBe("01022223333");
    expect(upsertNotification.mock.calls[0][0].create.smsBody).toContain(
      "https://example.com/i/i/manual-token",
    );
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: "assignment-2",
        currentInstallerId: "installer-2",
        status: "WAITING_INSTALLER_RESPONSE",
        statusChangedAt: now,
      },
    });
  });

  it("creates a manual direct assignment from a fallback order without an open issue", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: false,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [
        {
          id: "request-1",
          installAddressEncrypted: "서울 강남구 테헤란로 1",
          fallbackUsed: true,
          status: "FALLBACK_USED",
        },
      ],
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "서울강남기사",
      branch: "서울강남지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
      region: "서울",
      coverage: null,
      serviceAreas: ["서울 강남구"],
    });
    countAssignments.mockResolvedValue(0);
    createAssignment.mockResolvedValue({ id: "assignment-1" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "manual-token",
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentSource: "MANUAL_DIRECT",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
  });

  it("overrides an active admin review candidate when creating a manual direct assignment", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_ADMIN_REVIEW",
      hasOpenIssue: false,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-auto",
      customerRequests: [{ id: "request-1", installAddressEncrypted: "서울 강남구 테헤란로 1" }],
    });
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-auto",
      status: "WAITING_ADMIN_REVIEW",
      assignmentSource: "AUTO",
      selectionSnapshot: {
        installer: { businessNumber: "installer-auto" },
      },
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "서울강남기사",
      branch: "서울강남지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
      region: "서울",
      coverage: null,
      serviceAreas: ["서울 강남구"],
    });
    countAssignments.mockResolvedValue(1);
    createAssignment.mockResolvedValue({ id: "assignment-manual" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    updateAssignment.mockResolvedValue({ id: "assignment-auto", status: "ADMIN_MANUAL_OVERRIDDEN" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "manual-token",
      manualReason: "관리자 판단으로 다른 기사 지정",
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-auto" },
      data: {
        status: "ADMIN_MANUAL_OVERRIDDEN",
        cancelledByAdminId: "admin-1",
        selectionSnapshot: {
          installer: { businessNumber: "installer-auto" },
          manualOverride: {
            adminId: "admin-1",
            reason: "관리자 판단으로 다른 기사 지정",
            overriddenAt: now.toISOString(),
          },
        },
      },
    });
    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentNumber: 2,
        assignmentSource: "MANUAL_DIRECT",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        activeAssignmentId: "assignment-manual",
        currentInstallerId: "installer-2",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
  });

  it("rejects manual direct assignment when the same installer was already requested for the order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [{ id: "request-1", installAddressEncrypted: "서울 강남구 테헤란로 1" }],
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "서울강남기사",
      branch: "서울강남지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
      region: "서울",
      coverage: null,
      serviceAreas: ["서울 강남구"],
    });
    findFirstAssignment.mockResolvedValue({
      id: "assignment-1",
      installerId: "installer-2",
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("DUPLICATE_INSTALLER_REQUEST");

    expect(findFirstAssignment).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        installerId: "installer-2",
      },
      select: { id: true },
    });
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("requires a reason when manual direct assignment bypasses region matching", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [{ id: "request-1", installAddressEncrypted: "서울 강남구 테헤란로 1" }],
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "부산기사",
      branch: "부산지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
      region: "부산",
      coverage: null,
      serviceAreas: ["부산 해운대구"],
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("MANUAL_ASSIGNMENT_REASON_REQUIRED");

    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("allows region mismatch manual direct assignment when admin records a reason", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [{ id: "request-1", installAddressEncrypted: "서울 강남구 테헤란로 1" }],
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      name: "부산기사",
      branch: "부산지점",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
      region: "부산",
      coverage: null,
      serviceAreas: ["부산 해운대구"],
    });
    countAssignments.mockResolvedValue(0);
    createAssignment.mockResolvedValue({ id: "assignment-1" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "manual-token",
      manualReason: "긴급 일정으로 인접 지역 기사 지정",
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        selectionSnapshot: expect.objectContaining({
          manualReason: "긴급 일정으로 인접 지역 기사 지정",
          regionMatched: false,
        }),
      }),
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          manualReason: "긴급 일정으로 인접 지역 기사 지정",
          regionMatched: false,
        }),
      }),
    });
  });

  it("rejects manual direct assignment to an inactive installer", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "설치비 (K100) x1" },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      phone: "010-2222-3333",
      active: false,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("INSTALLER_NOT_ACTIVE");

    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("rejects manual direct assignment when installer capabilities do not satisfy the order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "용역 도어락 설치비(K100)+월패드 연동(RF447) x1" },
      requiredCapabilities: JSON.stringify(["DOORLOCK", "WALLPAD_HUB"]),
      requiredAqaraAppCapability: "NONE",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("INSTALLER_CAPABILITY_NOT_MATCHED");

    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("rejects manual direct assignment when installer Aqara app capability is too low", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "[잇섭PICK_앱 설치] 용역 도어락 설치비(K100) x1" },
      requiredCapabilities: JSON.stringify(["DOORLOCK"]),
      requiredAqaraAppCapability: "DOORLOCK_AND_APP",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      phone: "010-2222-3333",
      active: true,
      capabilities: ["DOORLOCK"],
      aqaraAppCapability: "NONE",
    });

    await expect(createManualInstallerAssignment("order-1", {
      installerId: "installer-2",
      adminId: "admin-1",
      now,
    })).rejects.toThrow("INSTALLER_AQARA_CAPABILITY_NOT_MATCHED");

    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("cancels an active workflow order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CANCELLED" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await cancelInstallationOrder("order-1", {
      adminId: "admin-1",
      reason: "고객 취소",
      now,
    });

    expect(updateCustomerRequest).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status: "CANCELLED" },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
        cancelledAt: now,
        cancelReason: "고객 취소",
        status: "CANCELLED",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "ADMIN_CANCELLED_ORDER",
        actorType: "ADMIN",
        actorId: "admin-1",
        reason: "고객 취소",
      }),
    });
  });

  it.each(["COMPLETED", "CANCELLED"])("blocks cancellation from %s", async (status) => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status,
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });

    await expect(cancelInstallationOrder("order-1", {
      adminId: "admin-1",
      reason: "고객 취소",
      now,
    })).rejects.toThrow("ORDER_NOT_CANCELLABLE");

    expect(findUniqueAssignment).not.toHaveBeenCalled();
    expect(updateAssignment).not.toHaveBeenCalled();
    expect(updateCustomerRequest).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("cancels a waiting response assignment when cancelling the order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-1",
    });
    findUniqueAssignment.mockResolvedValue({ id: "assignment-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "ADMIN_MANUAL_OVERRIDDEN" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CANCELLED" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await cancelInstallationOrder("order-1", {
      adminId: "admin-1",
      reason: "고객 취소",
      now,
    });

    expect(findUniqueAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      select: {
        id: true,
        status: true,
        assignmentSource: true,
      },
    });
    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "ADMIN_MANUAL_OVERRIDDEN",
        cancelledByAdminId: "admin-1",
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        activeAssignmentId: null,
        currentInstallerId: null,
        status: "CANCELLED",
      }),
    });
  });

  it("cancels a dispatched assignment so the installer token no longer remains valid", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-1",
    });
    findUniqueAssignment.mockResolvedValue({ id: "assignment-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "ADMIN_MANUAL_OVERRIDDEN" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CANCELLED" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await cancelInstallationOrder("order-1", {
      adminId: "admin-1",
      reason: "고객 취소",
      now,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "ADMIN_MANUAL_OVERRIDDEN",
        cancelledByAdminId: "admin-1",
      },
    });
  });

  it("keeps an accepted assignment record when cancelling an accepted order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-1",
    });
    findUniqueAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_ACCEPTED" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CANCELLED" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await cancelInstallationOrder("order-1", {
      adminId: "admin-1",
      reason: "고객 취소",
      now,
    });

    expect(updateAssignment).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        activeAssignmentId: null,
        currentInstallerId: null,
        status: "CANCELLED",
      }),
    });
  });

  it("marks an admin review order as requiring attention and overrides an active auto assignment", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_ADMIN_REVIEW",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-1",
    });
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "WAITING_ADMIN_REVIEW",
      assignmentSource: "AUTO",
      selectionSnapshot: {
        installer: { businessNumber: "installer-1" },
      },
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "ADMIN_MANUAL_OVERRIDDEN" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await switchInstallationOrderToManualRequired("order-1", {
      adminId: "admin-1",
      reason: "기사 일정 확인 필요",
      now,
    });

    expect(findUniqueAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      select: {
        id: true,
        status: true,
        assignmentSource: true,
        selectionSnapshot: true,
      },
    });
    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "ADMIN_MANUAL_OVERRIDDEN",
        cancelledByAdminId: "admin-1",
        selectionSnapshot: {
          installer: { businessNumber: "installer-1" },
          manualOverride: {
            adminId: "admin-1",
            reason: "기사 일정 확인 필요",
            overriddenAt: now.toISOString(),
          },
        },
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });
    expect(createIssue).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        type: "INSTALLER_NOT_ASSIGNED",
        title: "관리자 수동 처리 필요",
        description: "기사 일정 확인 필요",
        metadata: {
          activeAssignmentId: "assignment-1",
          activeCustomerRequestId: "request-1",
        },
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "ADMIN_SWITCHED_TO_MANUAL",
        actorType: "ADMIN",
        actorId: "admin-1",
        reason: "기사 일정 확인 필요",
        metadata: expect.objectContaining({
          activeAssignmentId: "assignment-1",
          activeCustomerRequestId: "request-1",
        }),
      }),
    });
  });

  it("rejects manual transition from an assigned order", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-1",
    });

    await expect(switchInstallationOrderToManualRequired("order-1", {
      adminId: "admin-1",
      reason: "수동 전환",
      now,
    })).rejects.toThrow("ORDER_NOT_MANUAL_SWITCHABLE");

    expect(findUniqueAssignment).not.toHaveBeenCalled();
    expect(updateAssignment).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("completes an order and ends an accepted assignment as admin completed", async () => {
    const now = new Date("2026-06-11T06:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "assignment-1",
    });
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "INSTALLER_ACCEPTED",
      assignmentSource: "MANUAL_DIRECT",
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "ADMIN_COMPLETED" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "COMPLETED" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await completeInstallationOrder("order-1", {
      adminId: "admin-1",
      reason: "현장 설치 완료 확인",
      now,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "ADMIN_COMPLETED",
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        status: "COMPLETED",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "ADMIN_COMPLETED_ORDER",
        actorType: "ADMIN",
        actorId: "admin-1",
        reason: "현장 설치 완료 확인",
      }),
    });
  });

  it.each([
    "READY_FOR_CANDIDATE_SELECTION",
    "WAITING_ADMIN_REVIEW",
    "WAITING_INSTALLER_RESPONSE",
    "CANCELLED",
    "COMPLETED",
  ])(
    "rejects admin completion from %s",
    async (status) => {
      const now = new Date("2026-06-11T06:00:00.000Z");
      findUniqueOrder.mockResolvedValue({
        id: "order-1",
        status,
        activeCustomerRequestId: "request-1",
        activeAssignmentId: null,
      });

      await expect(completeInstallationOrder("order-1", {
        adminId: "admin-1",
        reason: "현장 설치 완료 확인",
        now,
      })).rejects.toThrow("ORDER_NOT_COMPLETABLE");

      expect(updateOrder).not.toHaveBeenCalled();
    },
  );
});
