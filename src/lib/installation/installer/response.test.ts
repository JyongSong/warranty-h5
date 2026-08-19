import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInstallerAssignmentByToken,
  respondInstallerAssignment,
} from "@/lib/installation/installer/response";
import { decryptPii, encryptPii } from "@/lib/piiCrypto";

process.env.PII_ENCRYPTION_KEY = "test-pii-key";

const {
  findUniqueAssignment,
  transaction,
  findManyAssignments,
  findFirstAssignment,
  updateAssignment,
  countAssignments,
  createAssignment,
  upsertNotification,
  findManyInstallers,
  findUniqueInstaller,
  findUniqueOrder,
  updateOrder,
  findIssue,
  createIssue,
  updateIssue,
  updateManyIssues,
  countIssues,
  createStatusEvent,
} = vi.hoisted(() => ({
  findUniqueAssignment: vi.fn(),
  transaction: vi.fn(),
  findManyAssignments: vi.fn(),
  findFirstAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  countAssignments: vi.fn(),
  createAssignment: vi.fn(),
  upsertNotification: vi.fn(),
  findManyInstallers: vi.fn(),
  findUniqueInstaller: vi.fn(),
  findUniqueOrder: vi.fn(),
  updateOrder: vi.fn(),
  findIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  updateManyIssues: vi.fn(),
  countIssues: vi.fn(),
  createStatusEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationInstallerAssignmentAttempt: {
      findUnique: findUniqueAssignment,
    },
    $transaction: transaction,
  },
}));

function createTx() {
  return {
    installationInstallerAssignmentAttempt: {
      findUnique: findUniqueAssignment,
      findMany: findManyAssignments,
      findFirst: findFirstAssignment,
      update: updateAssignment,
      count: countAssignments,
      create: createAssignment,
    },
    installationNotification: {
      upsert: upsertNotification,
    },
    installer: {
      findMany: findManyInstallers,
      findUnique: findUniqueInstaller,
    },
    installationOrder: {
      findUnique: findUniqueOrder,
      update: updateOrder,
    },
    installationIssue: {
      findFirst: findIssue,
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

const assignment = {
  id: "assignment-1",
  installationOrderId: "order-1",
  customerRequestId: "request-1",
  installerId: "installer-1",
  assignmentSource: "AUTO",
  installerTokenExpiresAt: new Date("2026-06-13T01:00:00.000Z"),
  status: "WAITING_INSTALLER_RESPONSE",
  installationOrder: {
    id: "order-1",
    status: "WAITING_INSTALLER_RESPONSE",
    source: {
      sourceKey: "SO20260611001",
      customerNameEncrypted: encryptPii("홍길동"),
      phoneEncrypted: encryptPii("010-9999-0000"),
      memo: "용역 도어락 설치비(K100) x1 / 월패드 연동(RF447) x1 앱 설치",
    },
    activeAssignmentId: "assignment-1",
    customerRequests: [
      {
        id: "request-1",
        installAddressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        installAddress1Encrypted: encryptPii("서울 강남구"),
        installAddressDetailEncrypted: encryptPii("12층 1201호"),
        installDate: "2026-06-20",
        installTimeSlot: "오후 12:00 - 15:00",
        customerPhoneEncrypted: encryptPii("010-9999-0000"),
      },
    ],
  },
};

describe("installation installer response", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.com";
    findUniqueAssignment.mockReset();
    transaction.mockReset();
    findManyAssignments.mockReset();
    findFirstAssignment.mockReset();
    updateAssignment.mockReset();
    countAssignments.mockReset();
    createAssignment.mockReset();
    upsertNotification.mockReset();
    findManyInstallers.mockReset();
    findUniqueInstaller.mockReset();
    findUniqueOrder.mockReset();
    updateOrder.mockReset();
    findIssue.mockReset();
    createIssue.mockReset();
    updateIssue.mockReset();
    updateManyIssues.mockReset();
    countIssues.mockReset();
    createStatusEvent.mockReset();
    countIssues.mockResolvedValue(0);
    findIssue.mockResolvedValue(null);
    createIssue.mockResolvedValue({ id: "issue-1" });
    findFirstAssignment.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("returns valid assignment details for a dispatched token", async () => {
    findUniqueAssignment.mockResolvedValue(assignment);

    const result = await getInstallerAssignmentByToken("installer-token", {
      now: new Date("2026-06-11T01:00:00.000Z"),
    });

    expect(result.status).toBe("VALID");
    expect(result.assignment?.id).toBe("assignment-1");
    expect(result.assignment?.installationOrder.sourceErpOrderNo).toBe("SO20260611001");
    expect(findUniqueAssignment).toHaveBeenCalledWith({
      where: expect.any(Object),
      select: expect.objectContaining({
        installationOrder: expect.objectContaining({
          select: expect.objectContaining({
            source: expect.any(Object),
          }),
        }),
      }),
    });
  });

  it("treats a generated installer link as valid before the SMS sender starts the response deadline", async () => {
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      installerTokenExpiresAt: null,
      installerNotifiedAt: null,
      status: "WAITING_INSTALLER_RESPONSE",
    });

    const result = await getInstallerAssignmentByToken("installer-token", {
      now: new Date("2026-06-11T01:00:00.000Z"),
    });

    expect(result.status).toBe("VALID");
    expect(result.assignment?.installerTokenExpiresAt).toBeNull();
  });

  it("shows customer phone and detailed address before installer response", async () => {
    findUniqueAssignment.mockResolvedValue(assignment);

    const result = await getInstallerAssignmentByToken("installer-token", {
      now: new Date("2026-06-11T01:00:00.000Z"),
    });

    expect(result.assignment?.installationOrder.sourceCustomerName).toBeNull();
    expect(result.assignment?.installationOrder.sourcePhone).toBe("010-9999-0000");
    expect(result.assignment?.installationOrder.customerRequests[0]?.customerPhone).toBe(
      "010-9999-0000",
    );
    expect(result.assignment?.installationOrder.customerRequests[0]?.installAddress).toBe(
      "서울 강남구 테헤란로 1",
    );
    expect(result.assignment?.installationOrder.customerRequests[0]?.installAddressDetail).toBe(
      "12층 1201호",
    );
    expect(result.assignment?.installationOrder.productSummary).toBe(
      "용역 도어락 설치비(K100) x1 / 월패드 연동(RF447) x1 앱 설치",
    );
    expect(result.assignment?.installationOrder.requiredCapabilities).toEqual([
      "DOORLOCK",
      "WALLPAD_HUB",
    ]);
  });

  it("shows customer phone and address after installer accepts the assignment", async () => {
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      status: "INSTALLER_ACCEPTED",
    });

    const result = await getInstallerAssignmentByToken("installer-token", {
      now: new Date("2026-06-11T01:00:00.000Z"),
    });

    expect(result.status).toBe("RESPONDED");
    expect(result.assignment?.installationOrder.sourceCustomerName).toBe("홍길동");
    expect(result.assignment?.installationOrder.sourcePhone).toBe("010-9999-0000");
    expect(result.assignment?.installationOrder.customerRequests[0]?.customerPhone).toBe("010-9999-0000");
    expect(result.assignment?.installationOrder.customerRequests[0]?.installAddress).toBe(
      "서울 강남구 테헤란로 1",
    );
    expect(result.assignment?.installationOrder.customerRequests[0]?.installAddressDetail).toBe(
      "12층 1201호",
    );
    expect(result.assignment?.installationOrder.customerRequests[0]?.installTimeSlot).toBe(
      "오후 12:00 - 15:00",
    );
  });

  it("accepts a dispatched assignment and creates customer and installer SMS notifications", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue(assignment);
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_ACCEPTED" });
    findUniqueInstaller.mockResolvedValue({ id: "installer-1", phone: "010-1111-2222" });
    upsertNotification.mockResolvedValue({ id: "notification-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "INSTALLER_ASSIGNED" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "ACCEPT",
      now,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        acceptedAt: now,
        status: "INSTALLER_ACCEPTED",
      },
    });
    expect(upsertNotification).toHaveBeenCalledWith({
      where: { idempotencyKey: "customer-assignment-confirmed:assignment-1" },
      create: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentAttemptId: "assignment-1",
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientType: "CUSTOMER",
        status: "PENDING",
      }),
      update: {},
    });
    const customerNotification = upsertNotification.mock.calls.find(
      ([arg]) => arg.create.smsType === "CUSTOMER_ASSIGNMENT_CONFIRMED",
    )?.[0].create;
    expect(customerNotification.recipientPhoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(customerNotification.recipientPhoneEncrypted)).toBe("01099990000");
    expect(customerNotification.smsBody).not.toContain("홍길동");
    expect(customerNotification.smsBody).toContain("아카라라이프 설치 배정완료");
    expect(customerNotification.smsBody).toContain("배정된 기사님이 곧 연락드릴 예정입니다.");
    expect(customerNotification.smsBody).not.toContain("주문 상품");
    const installerNotification = upsertNotification.mock.calls.find(
      ([arg]) => arg.create.smsType === "INSTALLER_HAPPYCALL_GUIDE",
    )?.[0].create;
    expect(installerNotification).toMatchObject({
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      assignmentAttemptId: "assignment-1",
      smsType: "INSTALLER_HAPPYCALL_GUIDE",
      recipientType: "INSTALLER",
      smsTemplateKey: "installer_happycall_guide",
      status: "PENDING",
    });
    expect(installerNotification.recipientPhoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(installerNotification.recipientPhoneEncrypted)).toBe("01011112222");
    expect(installerNotification.smsBody).not.toContain("홍길동");
    expect(installerNotification.smsBody).toContain("주소:\n서울 강남구 테헤란로 1 12층 1201호");
    expect(installerNotification.smsBody).toContain("설치 희망일:\n2026-06-20");
    expect(installerNotification.smsBody).toContain("고객 전화번호:\n010-9999-0000");
    expect(installerNotification.smsBody).toContain("주문 상품:\n용역 도어락 설치비(K100) x1 외");
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "INSTALLER_ASSIGNED",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "WAITING_INSTALLER_RESPONSE",
        toStatus: "INSTALLER_ASSIGNED",
        eventType: "INSTALLER_ACCEPTED",
        actorType: "INSTALLER",
        actorId: "installer-1",
      }),
    });
  });

  it("rejects a dispatched assignment and creates the next pending review assignment", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue(assignment);
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_REJECTED" });
    findManyAssignments.mockResolvedValue([{ installerId: "installer-1" }]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "거절기사",
        phone: "010-1111-1111",
        branch: "거절지점",
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
        name: "차순위기사",
        phone: "010-2222-2222",
        branch: "차순위지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 1,
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(1);
    createAssignment.mockResolvedValue({ id: "assignment-2" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "next-installer-token",
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        rejectedAt: now,
        rejectReason: "일정 불가",
        status: "INSTALLER_REJECTED",
      },
    });
    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentNumber: 2,
        assignmentSource: "AUTO",
        matchTier: "EXACT_DISTRICT",
        installerTokenHash:
          "a1ae956f7ca402d15fe6aaf8e6c76e7612cc872f7deab9087b271c909cf3cea5",
        installerTokenExpiresAt: null,
        installerNotifiedAt: null,
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
    const nextNotification = upsertNotification.mock.calls.find(
      ([arg]) => arg.create.smsType === "INSTALLER_ASSIGNMENT_REQUEST",
    )?.[0].create;
    expect(nextNotification).toMatchObject({
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      assignmentAttemptId: "assignment-2",
      smsType: "INSTALLER_ASSIGNMENT_REQUEST",
      recipientType: "INSTALLER",
      smsTemplateKey: "installer_assignment_request",
      status: "PENDING",
      idempotencyKey: "installer-assignment-request:assignment-2",
    });
    expect(nextNotification.recipientPhoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(nextNotification.recipientPhoneEncrypted)).toBe("01022222222");
    expect(upsertNotification.mock.calls[0][0].create.smsBody).toContain(
      "https://example.com/i/i/next-installer-token",
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
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "WAITING_INSTALLER_RESPONSE",
        toStatus: "WAITING_INSTALLER_RESPONSE",
        eventType: "INSTALLER_REJECTED",
        actorType: "INSTALLER",
        actorId: "installer-1",
        reason: "일정 불가",
      }),
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
  });

  it("does not create a next assignment when another active attempt already exists", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue(assignment);
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_REJECTED" });
    findManyAssignments.mockResolvedValue([{ installerId: "installer-1" }]);
    findFirstAssignment.mockResolvedValue({
      id: "assignment-active",
      installerId: "installer-active",
      status: "SYSTEM_SMS_RETRY_PENDING",
    });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
    });

    expect(findFirstAssignment).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        id: { not: "assignment-1" },
        status: { in: ["WAITING_INSTALLER_RESPONSE", "SYSTEM_SMS_RETRY_PENDING"] },
      },
      select: { id: true, installerId: true, status: true },
    });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(upsertNotification).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: "assignment-active",
        currentInstallerId: "installer-active",
        status: "WAITING_INSTALLER_RESPONSE",
        statusChangedAt: now,
      },
    });
  });

  it("rejects a dispatched assignment and skips all installers already attempted for the order", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue(assignment);
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_REJECTED" });
    findManyAssignments.mockResolvedValue([
      { installerId: "installer-1" },
      { installerId: "installer-2" },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "현재기사",
        phone: "010-1111-1111",
        branch: "현재지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 0,
        active: true,
      },
      {
        id: "installer-2",
        name: "이전기사",
        phone: "010-2222-2222",
        branch: "이전지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 1,
        active: true,
      },
      {
        id: "installer-3",
        name: "차순위기사",
        phone: "010-3333-3333",
        branch: "차순위지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 2,
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(2);
    createAssignment.mockResolvedValue({ id: "assignment-3" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
    });

    expect(findManyAssignments).toHaveBeenCalledWith({
      where: { installationOrderId: "order-1" },
      select: { installerId: true, assignmentSource: true },
    });
    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installerId: "installer-3",
        assignmentNumber: 3,
        candidateRank: 3,
      }),
    });
  });

  it("prefers the next installer from the previous candidate run before fresh sorter order", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      installationOrder: {
        ...assignment.installationOrder,
        candidateRuns: [
          {
            candidates: [
              { installerId: "installer-1", rank: 1 },
              { installerId: "installer-2", rank: 2 },
              { installerId: "installer-3", rank: 3 },
            ],
          },
        ],
      },
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_REJECTED" });
    findManyAssignments.mockResolvedValue([{ installerId: "installer-1", assignmentSource: "AUTO" }]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-3",
        name: "새정렬1순위",
        phone: "010-3333-3333",
        branch: "강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 0,
        active: true,
      },
      {
        id: "installer-2",
        name: "이전후보2순위",
        phone: "010-2222-2222",
        branch: "강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 9,
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(1);
    createAssignment.mockResolvedValue({ id: "assignment-2" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installerId: "installer-2",
        selectionSnapshot: expect.objectContaining({
          reusedCandidateRun: true,
        }),
      }),
    });
  });

  it("records revalidation exclusions when previous candidates are no longer eligible", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      installationOrder: {
        ...assignment.installationOrder,
        candidateRuns: [
          {
            candidates: [
              { installerId: "installer-1", rank: 1 },
              { installerId: "installer-2", rank: 2 },
              { installerId: "installer-3", rank: 3 },
            ],
          },
        ],
      },
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_REJECTED" });
    findManyAssignments.mockResolvedValue([{ installerId: "installer-1", assignmentSource: "AUTO" }]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-3",
        name: "재검증통과기사",
        phone: "010-3333-3333",
        branch: "강남지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 0,
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(1);
    createAssignment.mockResolvedValue({ id: "assignment-2" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
    });

    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installerId: "installer-3",
        selectionSnapshot: expect.objectContaining({
          revalidationExclusions: [
            {
              installerId: "installer-2",
              reason: "REVALIDATION_FAILED",
            },
          ],
        }),
      }),
    });
  });

  it("returns an admin retry rejection to manual required without automatic next assignment", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      assignmentSource: "ADMIN_RETRY",
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_REJECTED" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        rejectedAt: now,
        rejectReason: "일정 불가",
        status: "INSTALLER_REJECTED",
      },
    });
    expect(findManyAssignments).not.toHaveBeenCalled();
    expect(findManyInstallers).not.toHaveBeenCalled();
    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: "issue-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "WAITING_INSTALLER_RESPONSE",
        toStatus: "READY_FOR_CANDIDATE_SELECTION",
        eventType: "INSTALLER_REJECTED",
        actorType: "INSTALLER",
        actorId: "installer-1",
        reason: "일정 불가",
      }),
    });
  });

  it("times out an auto assignment and creates the next waiting response assignment", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue(assignment);
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_RESPONSE_TIMED_OUT" });
    findManyAssignments.mockResolvedValue([{ installerId: "installer-1" }]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-1",
        name: "타임아웃기사",
        phone: "010-1111-1111",
        branch: "타임아웃지점",
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
        name: "차순위기사",
        phone: "010-2222-2222",
        branch: "차순위지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 1,
        active: true,
      },
    ]);
    countAssignments.mockResolvedValue(1);
    createAssignment.mockResolvedValue({ id: "assignment-2" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "INSTALLER_RESPONSE_TIMEOUT",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "next-installer-token",
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        timedOutAt: now,
        status: "INSTALLER_RESPONSE_TIMED_OUT",
      },
    });
    expect(createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        installerId: "installer-2",
        assignmentNumber: 2,
        assignmentSource: "AUTO",
        status: "WAITING_INSTALLER_RESPONSE",
      }),
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "WAITING_INSTALLER_RESPONSE",
        toStatus: "WAITING_INSTALLER_RESPONSE",
        eventType: "INSTALLER_TIMED_OUT",
        actorType: "INSTALLER",
        actorId: "installer-1",
        reason: "INSTALLER_RESPONSE_TIMEOUT",
      }),
    });
  });

  it("returns an admin retry timeout to manual required without automatic next assignment", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      assignmentSource: "ADMIN_RETRY",
    });
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_RESPONSE_TIMED_OUT" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "INSTALLER_RESPONSE_TIMEOUT",
      now,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        timedOutAt: now,
        status: "INSTALLER_RESPONSE_TIMED_OUT",
      },
    });
    expect(findManyAssignments).not.toHaveBeenCalled();
    expect(findManyInstallers).not.toHaveBeenCalled();
    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: "issue-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        fromStatus: "WAITING_INSTALLER_RESPONSE",
        toStatus: "READY_FOR_CANDIDATE_SELECTION",
        eventType: "INSTALLER_TIMED_OUT",
        actorType: "INSTALLER",
        actorId: "installer-1",
        reason: "INSTALLER_RESPONSE_TIMEOUT",
      }),
    });
  });

  it("allows the system timeout guard to close an expired assignment by token hash", async () => {
    const now = new Date("2026-06-14T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      installerTokenExpiresAt: new Date("2026-06-13T01:00:00.000Z"),
    });
    findManyAssignments.mockResolvedValue([]);
    findFirstAssignment.mockResolvedValue(null);
    findManyInstallers.mockResolvedValue([]);
    updateAssignment.mockResolvedValue({ id: "assignment-1", status: "INSTALLER_RESPONSE_TIMED_OUT" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createIssue.mockResolvedValue({ id: "issue-1" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("hashed-token", {
      response: "REJECT",
      rejectReason: "INSTALLER_RESPONSE_TIMEOUT",
      now,
      tokenIsHash: true,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        timedOutAt: now,
        status: "INSTALLER_RESPONSE_TIMED_OUT",
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "INSTALLER_CANDIDATE_EXHAUSTED",
        reason: "INSTALLER_RESPONSE_TIMEOUT",
      }),
    });
  });

  it("stops automatic fallback after the first automatic retry", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      id: "assignment-2",
      installerId: "installer-2",
      installationOrder: {
        ...assignment.installationOrder,
        activeAssignmentId: "assignment-2",
      },
    });
    updateAssignment.mockResolvedValue({ id: "assignment-2", status: "INSTALLER_REJECTED" });
    findManyAssignments.mockResolvedValue([
      { installerId: "installer-1", assignmentSource: "AUTO" },
      { installerId: "installer-2", assignmentSource: "AUTO" },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-4",
        name: "4순위기사",
        phone: "010-4444-4444",
        branch: "4순위지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 3,
        active: true,
      },
    ]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "일정 불가",
      now,
    });

    expect(createAssignment).not.toHaveBeenCalled();
    expect(createIssue).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        type: "INSTALLER_CANDIDATE_EXHAUSTED",
        title: "후보 기사 소진",
        description: "최초 요청 후 자동 재시도 1회 한도에 도달했습니다.",
      }),
      select: { id: true },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: "issue-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "INSTALLER_CANDIDATE_EXHAUSTED",
        reason: "일정 불가",
        metadata: expect.objectContaining({
          assignmentId: "assignment-2",
          issueId: "issue-1",
          autoAttemptCount: 2,
        }),
      }),
    });
  });

  it("stops automatic fallback after the third auto timeout", async () => {
    const now = new Date("2026-06-11T02:00:00.000Z");
    findUniqueAssignment.mockResolvedValue({
      ...assignment,
      id: "assignment-3",
      installerId: "installer-3",
      installationOrder: {
        ...assignment.installationOrder,
        activeAssignmentId: "assignment-3",
      },
    });
    updateAssignment.mockResolvedValue({ id: "assignment-3", status: "INSTALLER_RESPONSE_TIMED_OUT" });
    findManyAssignments.mockResolvedValue([
      { installerId: "installer-1", assignmentSource: "AUTO" },
      { installerId: "installer-2", assignmentSource: "AUTO" },
      { installerId: "installer-3", assignmentSource: "AUTO" },
    ]);
    findManyInstallers.mockResolvedValue([
      {
        id: "installer-4",
        name: "4순위기사",
        phone: "010-4444-4444",
        branch: "4순위지점",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK", "WALLPAD_HUB"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 3,
        active: true,
      },
    ]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_INSTALLER_RESPONSE" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await respondInstallerAssignment("installer-token", {
      response: "REJECT",
      rejectReason: "INSTALLER_RESPONSE_TIMEOUT",
      now,
    });

    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-3" },
      data: {
        timedOutAt: now,
        status: "INSTALLER_RESPONSE_TIMED_OUT",
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "INSTALLER_CANDIDATE_EXHAUSTED",
        reason: "INSTALLER_RESPONSE_TIMEOUT",
        metadata: expect.objectContaining({
          assignmentId: "assignment-3",
          issueId: "issue-1",
          autoAttemptCount: 3,
        }),
      }),
    });
  });
});
