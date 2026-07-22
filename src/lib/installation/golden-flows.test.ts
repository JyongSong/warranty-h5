import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveInstallationAssignmentByAdmin, dispatchReadyInstallationOrders } from "@/lib/installation/installer/dispatch";
import { completeInstallationOrder, createManualInstallerAssignment } from "@/lib/installation/installer/manual-operations";
import { respondInstallerAssignment } from "@/lib/installation/installer/response";
import { retrySmsNotification, sendInstallationNotificationById } from "@/lib/installation/notifications/outbox";
import { encryptPii } from "@/lib/piiCrypto";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    installationOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    installer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    installationNotification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    installationIssue: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    installationInstallerAssignmentAttempt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    installationCustomerRequest: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type GoldenOrder = {
  id: string;
  status: string;
  activeCustomerRequestId: string | null;
  activeAssignmentId: string | null;
  currentInstallerId: string | null;
  hasOpenIssue: boolean;
  lastIssueId: string | null;
  source: {
    sourceKey: string;
    memo: string;
    customerNameEncrypted: string;
    phoneEncrypted: string;
    addressEncrypted: string;
  };
};

type GoldenCustomerRequest = {
  id: string;
  installationOrderId: string;
  status: string;
  installAddressEncrypted: string;
  installAddress1Encrypted: string;
  installAddressDetailEncrypted: string;
  installDate: string;
  installTimeSlot: string;
  customerPhoneEncrypted: string;
};

type GoldenAssignment = {
  id: string;
  installationOrderId: string;
  customerRequestId: string;
  installerId: string;
  assignmentNumber: number;
  assignmentSource: string;
  status: string;
  installerTokenHash: string | null;
  installerTokenExpiresAt: Date | null;
  installerNotifiedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  timedOutAt: Date | null;
};

type GoldenNotification = {
  id: string;
  installationOrderId: string;
  customerRequestId: string | null;
  assignmentAttemptId: string | null;
  smsType: string;
  recipientPhoneEncrypted: string | null;
  smsBody: string;
  status: string;
  sentAt: Date | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
};

type GoldenIssue = {
  id: string;
  installationOrderId: string;
  type: string;
  status: string;
};

type GoldenState = {
  orders: GoldenOrder[];
  customerRequests: GoldenCustomerRequest[];
  installers: Array<{
    id: string;
    name: string;
    phone: string;
    branch: string;
    region: string;
    coverage: string | null;
    serviceAreas: string[];
    capabilities: string[];
    aqaraAppCapability: string;
    hasAqaraHubInventory: boolean;
    monthlyDispatchCount: number;
    active: boolean;
  }>;
  assignments: GoldenAssignment[];
  notifications: GoldenNotification[];
  issues: GoldenIssue[];
  statusEvents: unknown[];
  candidateRuns: unknown[];
};

let state: GoldenState;

describe("installation golden flows", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.com";
    vi.clearAllMocks();
    state = createGoldenState();
    installFakePrisma();
  });

  it("runs the automatic candidate approval flow through installer acceptance and admin completion", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");

    await dispatchReadyInstallationOrders({
      now,
      orderId: "order-auto",
      baseUrl: "https://example.com",
      tokenFactory: () => "auto-installer-token",
    });

    await approveInstallationAssignmentByAdmin("assignment-auto", {
      adminId: "admin-1",
      now: new Date("2026-06-11T02:00:00.000Z"),
      baseUrl: "https://example.com",
      tokenFactory: () => "approved-auto-token",
    });

    await sendInstallationNotificationById("notification-auto-request", {
      now: new Date("2026-06-11T02:10:00.000Z"),
      sendSms: async () => ({ providerMessageId: "sms-auto-request" }),
    });

    await respondInstallerAssignment("approved-auto-token", {
      response: "ACCEPT",
      now: new Date("2026-06-11T02:20:00.000Z"),
    });

    await completeInstallationOrder("order-auto", {
      adminId: "admin-1",
      reason: "자동 후보 승인 플로우 설치 완료",
      now: new Date("2026-06-11T03:00:00.000Z"),
    });

    const order = findOrder("order-auto");
    const assignment = state.assignments.find((item) => item.id === "assignment-auto");

    expect(order.status).toBe("COMPLETED");
    expect(order.activeAssignmentId).toBeNull();
    expect(order.hasOpenIssue).toBe(false);
    expect(assignment?.status).toBe("ADMIN_COMPLETED");
    expect(state.notifications.map((item) => item.smsType)).toEqual([
      "INSTALLER_ASSIGNMENT_REQUEST",
      "CUSTOMER_ASSIGNMENT_CONFIRMED",
      "INSTALLER_HAPPYCALL_GUIDE",
    ]);
    expect(state.statusEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "AUTO_CANDIDATE_SELECTED" }),
        expect.objectContaining({ eventType: "ADMIN_APPROVED_ASSIGNMENT" }),
        expect.objectContaining({ eventType: "INSTALLER_ACCEPTED" }),
        expect.objectContaining({ eventType: "ADMIN_COMPLETED_ORDER" }),
      ]),
    );
  });

  it("runs the manual assignment flow through installer acceptance and admin completion", async () => {
    await createManualInstallerAssignment("order-manual", {
      installerId: "installer-auto",
      adminId: "admin-1",
      manualReason: "후보 없음 예외 수동 배정",
      now: new Date("2026-06-11T01:00:00.000Z"),
      baseUrl: "https://example.com",
      tokenFactory: () => "manual-installer-token",
    });

    await sendInstallationNotificationById("notification-manual-request", {
      now: new Date("2026-06-11T01:10:00.000Z"),
      sendSms: async () => ({ providerMessageId: "sms-manual-request" }),
    });

    await respondInstallerAssignment("manual-installer-token", {
      response: "ACCEPT",
      now: new Date("2026-06-11T01:20:00.000Z"),
    });

    await completeInstallationOrder("order-manual", {
      adminId: "admin-1",
      reason: "수동 배정 플로우 설치 완료",
      now: new Date("2026-06-11T02:00:00.000Z"),
    });

    const order = findOrder("order-manual");
    const assignment = state.assignments.find((item) => item.installationOrderId === "order-manual");
    const candidateIssue = state.issues.find((item) =>
      item.installationOrderId === "order-manual" &&
      item.type === "INSTALLER_CANDIDATE_NOT_FOUND"
    );

    expect(order.status).toBe("COMPLETED");
    expect(order.activeAssignmentId).toBeNull();
    expect(order.hasOpenIssue).toBe(false);
    expect(assignment?.assignmentSource).toBe("MANUAL_DIRECT");
    expect(assignment?.status).toBe("ADMIN_COMPLETED");
    expect(candidateIssue?.status).toBe("RESOLVED");
  });

  it("runs the SMS failure retry flow and resolves the generated issue after resend succeeds", async () => {
    state.orders.push({
      id: "order-sms",
      status: "WAITING_CUSTOMER_INPUT",
      activeCustomerRequestId: "request-sms",
      activeAssignmentId: null,
      currentInstallerId: null,
      hasOpenIssue: false,
      lastIssueId: null,
      source: {
        sourceKey: "ISU-GOLDEN-SMS",
        memo: "용역 도어락 설치비(K100) x1",
        customerNameEncrypted: encryptPii("문자고객"),
        phoneEncrypted: encryptPii("010-3333-4444"),
        addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
      },
    });
    state.customerRequests.push({
      id: "request-sms",
      installationOrderId: "order-sms",
      status: "PENDING_INPUT",
      installAddressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
      installAddress1Encrypted: encryptPii("서울 강남구"),
      installAddressDetailEncrypted: encryptPii("1층"),
      installDate: "2026-06-20",
      installTimeSlot: "오전 09:00 - 12:00",
      customerPhoneEncrypted: encryptPii("01033334444"),
    });
    state.notifications.push({
      id: "notification-sms",
      installationOrderId: "order-sms",
      customerRequestId: "request-sms",
      assignmentAttemptId: null,
      smsType: "CUSTOMER_INPUT_LINK",
      recipientPhoneEncrypted: encryptPii("01033334444"),
      smsBody: "고객 입력 링크",
      status: "PENDING",
      sentAt: null,
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
      providerMessageId: null,
    });

    await expect(
      sendInstallationNotificationById("notification-sms", {
        now: new Date("2026-06-11T01:00:00.000Z"),
        sendSms: async () => {
          throw new Error("provider down");
        },
      }),
    ).rejects.toThrow("provider down");

    await expect(
      sendInstallationNotificationById("notification-sms", {
        now: new Date("2026-06-11T01:03:00.000Z"),
        sendSms: async () => {
          throw new Error("provider down");
        },
      }),
    ).rejects.toThrow("provider down");

    await expect(
      sendInstallationNotificationById("notification-sms", {
        now: new Date("2026-06-11T01:05:00.000Z"),
        sendSms: async () => {
          throw new Error("provider down");
        },
      }),
    ).rejects.toThrow("provider down");

    await retrySmsNotification("notification-sms", {
      now: new Date("2026-06-11T01:08:00.000Z"),
    });
    await sendInstallationNotificationById("notification-sms", {
      now: new Date("2026-06-11T01:10:00.000Z"),
      sendSms: async () => ({ providerMessageId: "sms-retry-success" }),
    });

    const order = findOrder("order-sms");
    const issue = state.issues.find((item) => item.installationOrderId === "order-sms");
    const notification = findNotification("notification-sms");

    expect(notification.status).toBe("SENT");
    expect(issue?.status).toBe("RESOLVED");
    expect(order.hasOpenIssue).toBe(false);
  });
});

function createGoldenState(): GoldenState {
  return {
    orders: [
      {
        id: "order-auto",
        status: "READY_FOR_CANDIDATE_SELECTION",
        activeCustomerRequestId: "request-auto",
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: false,
        lastIssueId: null,
        source: {
          sourceKey: "ISU-GOLDEN-AUTO",
          memo: "용역 도어락 설치비(K100) x1",
          customerNameEncrypted: encryptPii("골든고객"),
          phoneEncrypted: encryptPii("010-9999-0000"),
          addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        },
      },
      {
        id: "order-manual",
        status: "READY_FOR_CANDIDATE_SELECTION",
        activeCustomerRequestId: "request-manual",
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: "issue-manual-candidate",
        source: {
          sourceKey: "ISU-GOLDEN-MANUAL",
          memo: "용역 도어락 설치비(K100) x1",
          customerNameEncrypted: encryptPii("수동고객"),
          phoneEncrypted: encryptPii("010-8888-0000"),
          addressEncrypted: encryptPii("제주특별자치도 제주시 첨단로 1"),
        },
      },
    ],
    customerRequests: [
      {
        id: "request-auto",
        installationOrderId: "order-auto",
        status: "SUBMITTED",
        installAddressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        installAddress1Encrypted: encryptPii("서울 강남구"),
        installAddressDetailEncrypted: encryptPii("12층"),
        installDate: "2026-06-20",
        installTimeSlot: "오전 09:00 - 12:00",
        customerPhoneEncrypted: encryptPii("01099990000"),
      },
      {
        id: "request-manual",
        installationOrderId: "order-manual",
        status: "SUBMITTED",
        installAddressEncrypted: encryptPii("제주특별자치도 제주시 첨단로 1"),
        installAddress1Encrypted: encryptPii("제주특별자치도 제주시"),
        installAddressDetailEncrypted: encryptPii("1층"),
        installDate: "2026-06-20",
        installTimeSlot: "오전 09:00 - 12:00",
        customerPhoneEncrypted: encryptPii("01088880000"),
      },
    ],
    installers: [
      {
        id: "installer-auto",
        name: "골든기사",
        phone: "010-1111-2222",
        branch: "서울강남",
        region: "서울",
        coverage: null,
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "NONE",
        hasAqaraHubInventory: false,
        monthlyDispatchCount: 0,
        active: true,
      },
    ],
    assignments: [],
    notifications: [],
    issues: [
      {
        id: "issue-manual-candidate",
        installationOrderId: "order-manual",
        type: "INSTALLER_CANDIDATE_NOT_FOUND",
        status: "OPEN",
      },
    ],
    statusEvents: [],
    candidateRuns: [],
  };
}

function installFakePrisma() {
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(createTx()),
  );
  prismaMock.installationOrder.findMany.mockImplementation(async () => [
    {
      ...findOrder("order-auto"),
      customerRequests: [findRequest("request-auto")],
    },
  ]);
  prismaMock.installer.findMany.mockImplementation(async () => state.installers);
  prismaMock.installer.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    state.installers.find((item) => item.id === where.id) ?? null,
  );
  prismaMock.installationNotification.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    state.notifications.find((item) => item.id === where.id) ?? null,
  );
  prismaMock.installationNotification.findFirst.mockImplementation(async ({ where }: { where: Partial<GoldenNotification> }) =>
    state.notifications.find((item) => {
      return Object.entries(where).every(([key, value]) => (item as unknown as Record<string, unknown>)[key] === value);
    }) ?? null,
  );
  prismaMock.installationNotification.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const notification = createNotificationFromData(data, `notification-${state.notifications.length + 1}`);
    state.notifications.push(notification);
    return notification;
  });
  prismaMock.installationNotification.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const notification = findNotification(where.id);
    Object.assign(notification, data);
    return notification;
  });
  prismaMock.installationIssue.findFirst.mockImplementation(async ({ where }: { where: { installationOrderId: string; type: string; status: string; metadata?: unknown } }) =>
    state.issues.find((item) =>
      item.installationOrderId === where.installationOrderId &&
      item.type === where.type &&
      item.status === where.status
    ) ?? null,
  );
  prismaMock.installationIssue.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const issue = {
      id: `issue-${state.issues.length + 1}`,
      installationOrderId: data.installationOrderId as string,
      type: data.type as string,
      status: data.status as string,
    };
    state.issues.push(issue);
    return issue;
  });
  prismaMock.installationIssue.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const issue = findIssue(where.id);
    Object.assign(issue, data);
    return issue;
  });
  prismaMock.installationIssue.updateMany.mockImplementation(async ({ where, data }: { where: { installationOrderId: string; type?: string; status: string }; data: Record<string, unknown> }) => {
    const issues = state.issues.filter((item) =>
      item.installationOrderId === where.installationOrderId &&
      (!where.type || item.type === where.type) &&
      item.status === where.status
    );
    issues.forEach((issue) => Object.assign(issue, data));
    return { count: issues.length };
  });
  prismaMock.installationIssue.count.mockImplementation(async ({ where }: { where: { installationOrderId: string; status: string } }) =>
    state.issues.filter((item) => item.installationOrderId === where.installationOrderId && item.status === where.status).length,
  );
  prismaMock.installationInstallerAssignmentAttempt.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
    if (!where.id) return null;
    return toAssignmentWithRelations(findAssignment(where.id));
  });
  prismaMock.installationInstallerAssignmentAttempt.findMany.mockImplementation(async () => []);
  prismaMock.installationInstallerAssignmentAttempt.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const assignment = findAssignment(where.id);
    Object.assign(assignment, data);
    return assignment;
  });
  prismaMock.installationCustomerRequest.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const request = state.customerRequests.find((item) => item.id === where.id);
    if (!request) return null;
    return {
      ...request,
      installationOrder: findOrder(request.installationOrderId),
    };
  });
}

function createTx() {
  return {
    installationOrder: {
      findUnique: async ({ where }: { where: { id: string } }) => findOrder(where.id),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const order = findOrder(where.id);
        Object.assign(order, data);
        return order;
      },
    },
    installer: {
      findMany: async () => state.installers,
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.installers.find((item) => item.id === where.id) ?? null,
    },
    installationIssue: {
      findFirst: async ({ where }: { where: { installationOrderId: string; type: string; status: string } }) =>
        state.issues.find((item) =>
          item.installationOrderId === where.installationOrderId &&
          item.type === where.type &&
          item.status === where.status
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const issue = {
          id: `issue-${state.issues.length + 1}`,
          installationOrderId: data.installationOrderId as string,
          type: data.type as string,
          status: data.status as string,
        };
        state.issues.push(issue);
        return issue;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const issue = findIssue(where.id);
        Object.assign(issue, data);
        return issue;
      },
      updateMany: async ({ where, data }: { where: { installationOrderId: string; type?: string | { in: string[] }; status: string }; data: Record<string, unknown> }) => {
        const issues = state.issues.filter((item) => {
          const typeMatch = typeof where.type === "string"
            ? item.type === where.type
            : where.type?.in.includes(item.type) ?? true;
          return item.installationOrderId === where.installationOrderId &&
            item.status === where.status &&
            typeMatch;
        });
        issues.forEach((issue) => Object.assign(issue, data));
        return { count: issues.length };
      },
      count: async ({ where }: { where: { installationOrderId: string; status: string } }) =>
        state.issues.filter((item) => item.installationOrderId === where.installationOrderId && item.status === where.status).length,
    },
    installationInstallerAssignmentAttempt: {
      findUnique: async ({ where }: { where: { id?: string; installerTokenHash?: string } }) => {
        const assignment = where.id
          ? state.assignments.find((item) => item.id === where.id)
          : state.assignments.find((item) => item.installerTokenHash === where.installerTokenHash);
        return assignment ? toAssignmentWithRelations(assignment) : null;
      },
      findMany: async ({ where }: { where: { installationOrderId?: string } }) =>
        state.assignments.filter((item) => !where.installationOrderId || item.installationOrderId === where.installationOrderId),
      findFirst: async ({ where }: { where: { installationOrderId: string; status: { in: string[] }; id?: { not: string } } }) =>
        state.assignments.find((item) =>
          item.installationOrderId === where.installationOrderId &&
          where.status.in.includes(item.status) &&
          (!where.id?.not || item.id !== where.id.not)
        ) ?? null,
      count: async ({ where }: { where: { installationOrderId: string } }) =>
        state.assignments.filter((item) => item.installationOrderId === where.installationOrderId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const assignment = {
          id: data.assignmentSource === "AUTO" ? "assignment-auto" : `assignment-${state.assignments.length + 1}`,
          installationOrderId: data.installationOrderId as string,
          customerRequestId: data.customerRequestId as string,
          installerId: data.installerId as string,
          assignmentNumber: data.assignmentNumber as number,
          assignmentSource: data.assignmentSource as string,
          status: data.status as string,
          installerTokenHash: (data.installerTokenHash as string | null) ?? null,
          installerTokenExpiresAt: (data.installerTokenExpiresAt as Date | null) ?? null,
          installerNotifiedAt: (data.installerNotifiedAt as Date | null) ?? null,
          acceptedAt: null,
          rejectedAt: null,
          timedOutAt: null,
        };
        state.assignments.push(assignment);
        return assignment;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const assignment = findAssignment(where.id);
        Object.assign(assignment, data);
        return assignment;
      },
    },
    installationInstallerCandidateRun: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.candidateRuns.find((item) => {
          const run = item as Record<string, unknown>;
          return (
            run.installationOrderId === where.installationOrderId &&
            run.customerRequestId === where.customerRequestId &&
            run.assignmentSource === where.assignmentSource &&
            run.reasonCode === where.reasonCode
          );
        })
          ? { id: "candidate-run-existing" }
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.candidateRuns.push(data);
        return { id: `candidate-run-${state.candidateRuns.length}` };
      },
    },
    installationNotification: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const id = create.smsType === "INSTALLER_ASSIGNMENT_REQUEST"
          ? create.assignmentAttemptId === "assignment-auto"
            ? "notification-auto-request"
            : "notification-manual-request"
          : `notification-${state.notifications.length + 1}`;
        const existing = state.notifications.find((item) => item.id === id);
        if (existing) return existing;
        const notification = createNotificationFromData(create, id);
        state.notifications.push(notification);
        return notification;
      },
    },
    installationOrderStatusEvent: {
      create: async ({ data }: { data: unknown }) => {
        state.statusEvents.push(data);
        return { id: `event-${state.statusEvents.length}` };
      },
    },
  };
}

function createNotificationFromData(data: Record<string, unknown>, id: string): GoldenNotification {
  return {
    id,
    installationOrderId: data.installationOrderId as string,
    customerRequestId: (data.customerRequestId as string | null) ?? null,
    assignmentAttemptId: (data.assignmentAttemptId as string | null) ?? null,
    smsType: data.smsType as string,
    recipientPhoneEncrypted: (data.recipientPhoneEncrypted as string | null) ?? null,
    smsBody: data.smsBody as string,
    status: data.status as string,
    sentAt: null,
    retryCount: 0,
    errorCode: null,
    errorMessage: null,
    providerMessageId: null,
  };
}

function toAssignmentWithRelations(assignment: GoldenAssignment) {
  const order = findOrder(assignment.installationOrderId);
  const request = findRequest(assignment.customerRequestId);
  return {
    ...assignment,
    installationOrder: {
      ...order,
      customerRequests: [request],
    },
    customerRequest: request,
  };
}

function findOrder(id: string) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) throw new Error(`ORDER_NOT_FOUND:${id}`);
  return order;
}

function findRequest(id: string) {
  const request = state.customerRequests.find((item) => item.id === id);
  if (!request) throw new Error(`REQUEST_NOT_FOUND:${id}`);
  return request;
}

function findAssignment(id: string) {
  const assignment = state.assignments.find((item) => item.id === id);
  if (!assignment) throw new Error(`ASSIGNMENT_NOT_FOUND:${id}`);
  return assignment;
}

function findNotification(id: string) {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) throw new Error(`NOTIFICATION_NOT_FOUND:${id}`);
  return notification;
}

function findIssue(id: string) {
  const issue = state.issues.find((item) => item.id === id);
  if (!issue) throw new Error(`ISSUE_NOT_FOUND:${id}`);
  return issue;
}
