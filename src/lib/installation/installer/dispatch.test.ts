import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveInstallationAssignmentByAdmin,
  dispatchReadyInstallationOrders,
  retryInstallationOrderAssignmentByAdmin,
} from "@/lib/installation/installer/dispatch";
import { decryptPii, hmacPii } from "@/lib/piiCrypto";

const {
  transaction,
  findManyOrders,
  findManyInstallers,
  findUniqueInstaller,
  findUniqueOrder,
  updateOrder,
  findIssue,
  createIssue,
  updateIssue,
  countIssues,
  findFirstAssignment,
  findUniqueAssignment,
  updateAssignment,
  countAssignments,
  createAssignment,
  findFirstCandidateRun,
  createCandidateRun,
  upsertNotification,
  createStatusEvent,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findManyOrders: vi.fn(),
  findManyInstallers: vi.fn(),
  findUniqueInstaller: vi.fn(),
  findUniqueOrder: vi.fn(),
  updateOrder: vi.fn(),
  findIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  countIssues: vi.fn(),
  findFirstAssignment: vi.fn(),
  findUniqueAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  countAssignments: vi.fn(),
  createAssignment: vi.fn(),
  findFirstCandidateRun: vi.fn(),
  createCandidateRun: vi.fn(),
  upsertNotification: vi.fn(),
  createStatusEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrder: {
      findMany: findManyOrders,
      findUnique: findUniqueOrder,
      update: updateOrder,
    },
    installationIssue: {
      findFirst: findIssue,
      create: createIssue,
      update: updateIssue,
    },
    installer: {
      findMany: findManyInstallers,
      findUnique: findUniqueInstaller,
    },
    $transaction: transaction,
  },
}));

type SkippedCandidateReasonCase = [
  status: string,
  activeAssignmentId: string | null,
  activeAssignmentStatus: string | null,
  reasonCode: string,
  installDate: string | null,
];

const skippedCandidateReasonCases: SkippedCandidateReasonCase[] = [
  ["WAITING_CUSTOMER_INPUT", null, null, "STATUS_NOT_AUTO_REQUESTABLE", null],
  ["READY_FOR_CANDIDATE_SELECTION", null, null, "MISSING_INSTALL_DATE", null],
  ["READY_FOR_CANDIDATE_SELECTION", "assignment-active", "WAITING_INSTALLER_RESPONSE", "ACTIVE_ASSIGNMENT_EXISTS", null],
  ["READY_FOR_CANDIDATE_SELECTION", "assignment-active", "SYSTEM_SMS_RETRY_PENDING", "SYSTEM_SMS_RETRY_PENDING", null],
  ["READY_FOR_CANDIDATE_SELECTION", null, null, "INSTALL_DATE_TOO_SOON", "2026-06-11"],
  ["READY_FOR_CANDIDATE_SELECTION", null, null, "INSTALL_DATE_TOO_LATE", "2026-07-20"],
];

function createTx() {
  return {
    installationOrder: {
      findUnique: findUniqueOrder,
      update: updateOrder,
    },
    installer: {
      findUnique: findUniqueInstaller,
    },
    installationIssue: {
      findFirst: findIssue,
      create: createIssue,
      update: updateIssue,
      count: countIssues,
    },
    installationInstallerAssignmentAttempt: {
      findUnique: findUniqueAssignment,
      findFirst: findFirstAssignment,
      update: updateAssignment,
      count: countAssignments,
      create: createAssignment,
    },
    installationInstallerCandidateRun: {
      findFirst: findFirstCandidateRun,
      create: createCandidateRun,
    },
    installationNotification: {
      upsert: upsertNotification,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  };
}

describe("dispatchReadyInstallationOrders", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    transaction.mockReset();
    findManyOrders.mockReset();
    findManyInstallers.mockReset();
    findUniqueInstaller.mockReset();
    findUniqueOrder.mockReset();
    updateOrder.mockReset();
    findIssue.mockReset();
    createIssue.mockReset();
    updateIssue.mockReset();
    countIssues.mockReset();
    findFirstAssignment.mockReset();
    findUniqueAssignment.mockReset();
    updateAssignment.mockReset();
    countAssignments.mockReset();
    createAssignment.mockReset();
    findFirstCandidateRun.mockReset();
    createCandidateRun.mockReset();
    upsertNotification.mockReset();
    createStatusEvent.mockReset();
    findIssue.mockResolvedValue(null);
    countIssues.mockResolvedValue(0);
    findFirstAssignment.mockResolvedValue(null);
    findFirstCandidateRun.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("creates an admin review assignment using saved dispatch requirements before source memo fallback", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "[앱 설치] 설치비 (K100) x1 / 월패드 연동(RF447) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK", "WALLPAD_HUB"]),
        requiredAqaraAppCapability: "DOORLOCK_AND_APP",
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installAddress1Encrypted: "서울 강남구",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "서울강남기사",
        phone: "010-1111-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "NONE",
        monthlyDispatchCount: 0,
        active: true,
      },
      {
        id: "installer-2",
        name: "앱가능기사",
        phone: "010-2222-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 1,
        lastRequestedAt: new Date("2026-06-10T00:00:00.000Z"),
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(0);
    createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });
    createAssignment.mockResolvedValue({ id: "assignment-1" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    findIssue.mockResolvedValue({ id: "issue-1" });
    countIssues.mockResolvedValue(0);
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_ADMIN_REVIEW" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await dispatchReadyInstallationOrders({
      now,
      limit: 10,
      baseUrl: "https://example.com",
      tokenFactory: () => "installer-token",
    });

    expect(result).toEqual({ dispatchedCount: 1, skippedCount: 0, failedCount: 0 });
    expect(findManyOrders).toHaveBeenCalledWith({
      where: {
        status: "READY_FOR_CANDIDATE_SELECTION",
        activeAssignmentId: null,
        hasOpenIssue: false,
        customerRequests: {
          some: {
            status: { in: ["SUBMITTED", "FALLBACK_USED"] },
            installDate: {
              lte: "2026-06-21",
            },
          },
        },
      },
      orderBy: { statusChangedAt: "asc" },
      take: 10,
      select: expect.any(Object),
    });
    expect(findManyInstallers).toHaveBeenCalledWith({
      where: {
        active: true,
        capabilities: { hasEvery: ["DOORLOCK", "WALLPAD_HUB"] },
      },
      orderBy: [{ monthlyDispatchCount: "asc" }, { id: "asc" }],
      select: expect.objectContaining({
        id: true,
        phone: true,
        branch: true,
        region: true,
        serviceAreas: true,
      }),
    });
    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentNumber: 1,
        assignmentSource: "AUTO",
        matchTier: "EXACT_DISTRICT",
        candidateRank: 1,
        installerTokenHash: null,
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_ADMIN_REVIEW",
      }),
    });
    expect(createCandidateRun).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: null,
        inputSnapshot: expect.objectContaining({
          requiredCapabilities: ["DOORLOCK", "WALLPAD_HUB"],
          requiredAqaraAppCapability: "DOORLOCK_AND_APP",
          installAddress: "서울 강남구 테헤란로 1",
          installDate: "2026-06-20",
        }),
        createdAt: now,
        candidates: {
          create: [
            expect.objectContaining({
              installerId: "installer-2",
              rank: 1,
              isAutoRequestCandidate: true,
              regionTier: "EXACT_DISTRICT",
              monthlyDispatchCount: 1,
              lastRequestedAt: new Date("2026-06-10T00:00:00.000Z"),
              excludedReason: null,
            }),
          ],
        },
      },
    });
    expect(upsertNotification).not.toHaveBeenCalled();
    expect(updateIssue).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionNote: "기사 후보 재탐색 성공으로 자동 해결했습니다.",
        updatedAt: now,
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
      data: {
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
        hasOpenIssue: false,
        lastIssueId: null,
        status: "WAITING_ADMIN_REVIEW",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: "READY_FOR_CANDIDATE_SELECTION",
        toStatus: "WAITING_ADMIN_REVIEW",
        eventType: "AUTO_CANDIDATE_SELECTED",
        actorType: "SYSTEM",
        actorId: null,
        reason: null,
          metadata: {
            customerRequestId: "request-1",
            assignmentId: "assignment-1",
            installerId: "installer-2",
            assignmentSource: "AUTO",
          },
        createdAt: now,
      },
    });
  });

  it("can dispatch a single ready order immediately after customer submit", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([]);

    await dispatchReadyInstallationOrders({
      now,
      limit: 1,
      orderId: "order-1",
      baseUrl: "https://example.com",
    });

    expect(findManyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "order-1",
          status: "READY_FOR_CANDIDATE_SELECTION",
        }),
        take: 1,
      }),
    );
  });

  it.each(skippedCandidateReasonCases)(
    "records skipped candidate reason %s/%s/%s as %s",
    async (status, activeAssignmentId, activeAssignmentStatus, reasonCode, installDate) => {
      const now = new Date("2026-06-11T01:00:00.000Z");
      findManyOrders.mockResolvedValue([]);
      findUniqueOrder.mockResolvedValue({
        id: "order-1",
        status,
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        activeCustomerRequestId: "request-1",
        activeAssignmentId,
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate,
          },
        ],
      });
      if (activeAssignmentId) {
        findFirstAssignment.mockResolvedValue({
          id: activeAssignmentId,
          status: activeAssignmentStatus,
          assignmentSource: "AUTO",
        });
      }
      createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });

      const result = await dispatchReadyInstallationOrders({
        now,
        orderId: "order-1",
        baseUrl: "https://example.com",
      });

      expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
      expect(createCandidateRun).toHaveBeenCalledWith({
        data: expect.objectContaining({
          installationOrderId: "order-1",
          customerRequestId: "request-1",
          assignmentSource: "AUTO",
          reasonCode,
        }),
      });
      expect(createAssignment).not.toHaveBeenCalled();
    },
  );

  it("records each automatic candidate failure reason only once per customer request", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([]);
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      source: { memo: "설치비 (K100) x1", addressEncrypted: null },
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [
        {
          id: "request-1",
          installAddressEncrypted: "서울 강남구 테헤란로 1",
          installDate: null,
        },
      ],
    });
    findFirstCandidateRun.mockResolvedValue({ id: "candidate-run-existing" });

    const result = await dispatchReadyInstallationOrders({
      now,
      orderId: "order-1",
      baseUrl: "https://example.com",
    });

    expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(findFirstCandidateRun).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: "MISSING_INSTALL_DATE",
      },
      select: { id: true },
    });
    expect(createCandidateRun).not.toHaveBeenCalled();
  });

  it("counts an unexpected automatic dispatch error as a failure", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installAddress1Encrypted: "서울 강남구",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    findManyInstallers.mockRejectedValue(new Error("installer lookup failed"));
    createIssue.mockResolvedValue({ id: "issue-1" });
    updateOrder.mockResolvedValue({ id: "order-1" });

    await expect(
      dispatchReadyInstallationOrders({ now, baseUrl: "https://example.com" }),
    ).resolves.toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 1 });
    expect(createIssue).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        type: "INSTALLATION_AUTOMATION_FAILED",
        title: "자동 배정 처리 실패",
        description: "installer lookup failed",
        metadata: { stage: "DISPATCH_READY_ORDER" },
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    consoleError.mockRestore();
  });

  it("does not create another active assignment when an active attempt already exists", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK"]),
        requiredAqaraAppCapability: "NONE",
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "서울강남기사",
        phone: "010-1111-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "NONE",
        monthlyDispatchCount: 0,
        active: true,
      },
    ]);
    findFirstAssignment.mockResolvedValue({ id: "assignment-active", status: "SYSTEM_SMS_RETRY_PENDING" });

    const result = await dispatchReadyInstallationOrders({
      now,
      baseUrl: "https://example.com",
    });

    expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(findFirstAssignment).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        status: { in: ["WAITING_ADMIN_REVIEW", "WAITING_INSTALLER_RESPONSE", "SYSTEM_SMS_RETRY_PENDING"] },
      },
      select: { id: true, assignmentSource: true, status: true },
    });
    expect(createCandidateRun).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: "SYSTEM_SMS_RETRY_PENDING",
      }),
    });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(upsertNotification).not.toHaveBeenCalled();
  });

  it("opens an admin issue when automatic dispatch selects an already-requested installer", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installAddress1Encrypted: "서울 강남구",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "기요청기사",
        phone: "010-1111-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "NONE",
        monthlyDispatchCount: 0,
        active: true,
      },
    ]);
    findFirstAssignment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "assignment-old" });
    createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });
    createIssue.mockResolvedValue({ id: "issue-1" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await expect(
      dispatchReadyInstallationOrders({ now, baseUrl: "https://example.com" }),
    ).resolves.toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });

    expect(createIssue).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        type: "INSTALLER_CANDIDATE_EXHAUSTED",
        title: "자동 배정 중복 요청 차단",
        metadata: expect.objectContaining({
          customerRequestId: "request-1",
          installerId: "installer-1",
          reasonCode: "DUPLICATE_INSTALLER_REQUEST",
        }),
      }),
      select: { id: true },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        eventType: "INSTALLER_CANDIDATE_EXHAUSTED",
        reason: "DUPLICATE_INSTALLER_REQUEST",
        metadata: expect.objectContaining({ issueId: "issue-1" }),
      }),
    });
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("sends installer assignment SMS only after admin approval", async () => {
    const now = new Date("2026-06-11T03:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      installerId: "installer-2",
      status: "WAITING_ADMIN_REVIEW",
      assignmentSource: "AUTO",
      installationOrder: {
        id: "order-1",
        status: "WAITING_ADMIN_REVIEW",
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
      },
      customerRequest: {
        installAddress1Encrypted: "서울 강남구",
        installDate: "2026-06-20",
      },
    });
    findUniqueInstaller.mockResolvedValue({
      id: "installer-2",
      phone: "010-2222-2222",
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "WAITING_INSTALLER_RESPONSE" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_ADMIN_REVIEW" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await approveInstallationAssignmentByAdmin("assignment-1", {
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "approved-token",
    });

    expect(result).toEqual({
      assignmentId: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeAttempt: {
        id: "assignment-1",
        assignmentType: "AUTO",
        assignmentStatus: "WAITING_INSTALLER_RESPONSE",
        smsRetryPending: false,
      },
    });
    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        approvedByAdminId: "admin-1",
        installerTokenHash:
          "7d2f9562c5604b2edae0d32099dc4c82e1fcb59262c2e8860a9d05e2c524c2f7",
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_INSTALLER_RESPONSE",
      },
    });
    expect(upsertNotification).toHaveBeenCalledWith({
      where: { idempotencyKey: "installer-assignment-request:assignment-1" },
      create: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientType: "INSTALLER",
        recipientPhoneEncrypted: expect.stringMatching(/^enc:v1:/),
        recipientPhoneHash: hmacPii("01022222222"),
        smsTemplateKey: "installer_assignment_request",
        status: "PENDING",
        idempotencyKey: "installer-assignment-request:assignment-1",
      }),
      update: {},
    });
    expect(decryptPii(upsertNotification.mock.calls[0][0].create.recipientPhoneEncrypted)).toBe("01022222222");
    expect(upsertNotification.mock.calls[0][0].create.smsBody).toContain(
      "https://example.com/i/i/approved-token",
    );
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
        status: "WAITING_INSTALLER_RESPONSE",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "WAITING_ADMIN_REVIEW",
        toStatus: "WAITING_INSTALLER_RESPONSE",
        eventType: "ADMIN_APPROVED_ASSIGNMENT",
        actorType: "ADMIN",
        actorId: "admin-1",
      }),
    });
  });

  it("rejects admin approval when the assignment or order is no longer waiting for review", async () => {
    findUniqueAssignment.mockResolvedValueOnce({
      id: "assignment-1",
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      installerId: "installer-2",
      status: "WAITING_INSTALLER_RESPONSE",
      assignmentSource: "AUTO",
      installationOrder: {
        id: "order-1",
        status: "WAITING_ADMIN_REVIEW",
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
      },
      customerRequest: null,
    });

    await expect(
      approveInstallationAssignmentByAdmin("assignment-1", {
        adminId: "admin-1",
        now: new Date("2026-06-11T03:00:00.000Z"),
      }),
    ).rejects.toThrow("ASSIGNMENT_NOT_WAITING_ADMIN_REVIEW");

    findUniqueAssignment.mockResolvedValueOnce({
      id: "assignment-1",
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      installerId: "installer-2",
      status: "WAITING_ADMIN_REVIEW",
      assignmentSource: "AUTO",
      installationOrder: {
        id: "order-1",
        status: "WAITING_INSTALLER_RESPONSE",
        activeAssignmentId: "assignment-1",
        currentInstallerId: "installer-2",
      },
      customerRequest: null,
    });

    await expect(
      approveInstallationAssignmentByAdmin("assignment-1", {
        adminId: "admin-1",
        now: new Date("2026-06-11T03:00:00.000Z"),
      }),
    ).rejects.toThrow("ORDER_NOT_WAITING_ADMIN_REVIEW");

    expect(updateAssignment).not.toHaveBeenCalled();
    expect(upsertNotification).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("creates an issue and moves the order to manual required when no candidate exists", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK"]),
        requiredAqaraAppCapability: "NONE",
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    findManyInstallers.mockResolvedValue([]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await dispatchReadyInstallationOrders({ now, baseUrl: "https://example.com" });

    expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(createIssue).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        title: "후보 기사 없음",
        description: "조건에 맞는 후보 기사가 없습니다.",
        status: "OPEN",
      }),
      select: { id: true },
    });
    expect(createCandidateRun).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: "NO_CAPABILITY_MATCH",
        inputSnapshot: expect.objectContaining({
          requiredCapabilities: ["DOORLOCK"],
          requiredAqaraAppCapability: "NONE",
          installAddress: "서울 강남구 테헤란로 1",
          installDate: "2026-06-20",
        }),
        createdAt: now,
        candidates: {
          create: [],
        },
      },
    });
    expect(updateOrder).toHaveBeenLastCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: "READY_FOR_CANDIDATE_SELECTION",
        toStatus: "READY_FOR_CANDIDATE_SELECTION",
        eventType: "INSTALLER_CANDIDATE_NOT_FOUND",
        actorType: "SYSTEM",
        actorId: null,
        reason: "조건에 맞는 후보 기사가 없습니다.",
        metadata: {
          customerRequestId: "request-1",
          issueId: "issue-1",
        },
        createdAt: now,
      },
    });
  });

  it("creates a no-region-match candidate run when capable installers do not serve the address", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK"]),
        requiredAqaraAppCapability: "NONE",
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "부산기사",
        phone: "010-1111-2222",
        branch: "부산지점",
        region: "부산",
        coverage: null,
        serviceAreas: ["부산 해운대구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "NONE",
        monthlyDispatchCount: 0,
        active: true,
      },
    ]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await dispatchReadyInstallationOrders({ now, baseUrl: "https://example.com" });

    expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(createCandidateRun).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: "NO_REGION_MATCH",
        candidates: {
          create: [],
        },
      }),
    });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenLastCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });
  });

  it("records an unparsable address candidate run when the install address is missing", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK"]),
        requiredAqaraAppCapability: "NONE",
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: null,
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await dispatchReadyInstallationOrders({ now, baseUrl: "https://example.com" });

    expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(createCandidateRun).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: "UNPARSABLE_INSTALL_ADDRESS",
        inputSnapshot: expect.objectContaining({
          requiredCapabilities: ["DOORLOCK"],
          requiredAqaraAppCapability: "NONE",
          installAddress: null,
          installDate: "2026-06-20",
        }),
      }),
    });
  });

  it("keeps an order at candidate selection when product requirements are unmapped", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findManyOrders.mockResolvedValue([
      {
        id: "order-1",
        source: { memo: "알 수 없는 설치 상품 x1", addressEncrypted: null },
        activeCustomerRequestId: "request-1",
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate: "2026-06-20",
          },
        ],
      },
    ]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    createCandidateRun.mockResolvedValue({ id: "candidate-run-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await dispatchReadyInstallationOrders({ now, baseUrl: "https://example.com" });

    expect(result).toEqual({ dispatchedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(findManyInstallers).not.toHaveBeenCalled();
    expect(createIssue).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        type: "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
        title: "제품 요구사항 미매핑",
      }),
      select: { id: true },
    });
    expect(createCandidateRun).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentSource: "AUTO",
        reasonCode: "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
      }),
    });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenLastCalledWith({
      where: { id: "order-1" },
      data: {
        hasOpenIssue: true,
        lastIssueId: "issue-1",
      },
    });
  });

  it("creates an admin retry waiting response assignment from a manual required order", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findUniqueOrder
      .mockResolvedValueOnce({
        id: "order-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        hasOpenIssue: true,
        source: { memo: "[잇섭PICK_앱 설치] 용역 도어락 설치비(K100)+월패드 연동(RF447) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK", "WALLPAD_HUB"]),
        requiredAqaraAppCapability: "DOORLOCK_AND_APP",
        activeCustomerRequestId: "request-1",
        activeAssignmentId: null,
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate: "2026-06-20",
          },
        ],
      })
      .mockResolvedValueOnce({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-2",
        name: "재실행기사",
        phone: "010-2222-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 1,
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(2);
    createAssignment.mockResolvedValue({ id: "assignment-3" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_ADMIN_REVIEW" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await retryInstallationOrderAssignmentByAdmin("order-1", {
      adminId: "admin-1",
      reason: "후보 재확인",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "admin-retry-token",
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentNumber: 3,
        assignmentSource: "ADMIN_RETRY",
        matchTier: "EXACT_DISTRICT",
        candidateRank: 1,
        installerTokenHash: null,
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_ADMIN_REVIEW",
      }),
    });
    expect(upsertNotification).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: "assignment-3",
        currentInstallerId: "installer-2",
        status: "WAITING_ADMIN_REVIEW",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "READY_FOR_CANDIDATE_SELECTION",
        toStatus: "WAITING_ADMIN_REVIEW",
        eventType: "ADMIN_RETRY_ASSIGNMENT_CREATED",
        actorType: "ADMIN",
        actorId: "admin-1",
        reason: "후보 재확인",
      }),
    });
  });

  it("does not create an admin retry assignment for an installer already requested on the order", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findUniqueOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      hasOpenIssue: true,
      source: { memo: "설치비 (K100) x1", addressEncrypted: null },
      requiredCapabilities: JSON.stringify(["DOORLOCK"]),
      requiredAqaraAppCapability: "NONE",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
      customerRequests: [
        {
          id: "request-1",
          installAddressEncrypted: "서울 강남구 테헤란로 1",
          installDate: "2026-06-20",
        },
      ],
    });
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "이전요청기사",
        phone: "010-1111-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "NONE",
        monthlyDispatchCount: 0,
        active: true,
      },
    ]);
    findFirstAssignment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "assignment-old" });

    const result = await retryInstallationOrderAssignmentByAdmin("order-1", {
      adminId: "admin-1",
      reason: "후보 재확인",
      now,
      baseUrl: "https://example.com",
    });

    expect(result).toEqual({
      assignmentId: null,
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeAttempt: null,
      reasonCode: "DUPLICATE_INSTALLER_REQUEST",
    });
    expect(findFirstAssignment).toHaveBeenLastCalledWith({
      where: {
        installationOrderId: "order-1",
        installerId: "installer-1",
      },
      select: { id: true },
    });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(upsertNotification).not.toHaveBeenCalled();
  });

  it("keeps the current progress status when admin retry has no candidate", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findUniqueOrder
      .mockResolvedValueOnce({
        id: "order-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        hasOpenIssue: true,
        source: { memo: "설치비 (K100) x1", addressEncrypted: null },
        requiredCapabilities: JSON.stringify(["DOORLOCK"]),
        requiredAqaraAppCapability: "NONE",
        activeCustomerRequestId: "request-1",
        activeAssignmentId: null,
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted: "서울 강남구 테헤란로 1",
            installDate: "2026-06-20",
          },
        ],
      })
      .mockResolvedValueOnce({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    findManyInstallers.mockResolvedValue([]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await retryInstallationOrderAssignmentByAdmin("order-1", {
      adminId: "admin-1",
      reason: "후보 재확인",
      now,
      baseUrl: "https://example.com",
    });

    expect(createAssignment).not.toHaveBeenCalled();
    expect(createIssue).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        title: "후보 기사 없음",
        description: "관리자 재실행 결과 조건에 맞는 후보 기사가 없습니다.",
        status: "OPEN",
      }),
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
});
