import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignInstallationOrderToAgent } from "@/lib/installation/installer/manual-operations";

const mocks = vi.hoisted(() => ({
  findAgents: vi.fn(),
  findOrderOutsideTx: vi.fn(),
  findOrder: vi.fn(),
  findInstaller: vi.fn(),
  findFirstAssignment: vi.fn(),
  countAssignments: vi.fn(),
  createAssignment: vi.fn(),
  upsertNotification: vi.fn(),
  transition: vi.fn(),
  push: vi.fn(),
  sms: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installer: { findMany: mocks.findAgents, findUnique: vi.fn().mockResolvedValue({ phone: "010-1111-2222" }) },
    installationOrder: { findUnique: mocks.findOrderOutsideTx },
    $transaction: (cb: (tx: unknown) => unknown) =>
      cb({
        installationOrder: { findUnique: mocks.findOrder },
        installer: { findUnique: mocks.findInstaller },
        installationInstallerAssignmentAttempt: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: mocks.findFirstAssignment,
          count: mocks.countAssignments,
          create: mocks.createAssignment,
          update: vi.fn(),
        },
        installationNotification: { upsert: mocks.upsertNotification },
      }),
  },
}));
vi.mock("@/lib/installation/orders/status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/installation/orders/status")>()),
  transitionInstallationOrderStatus: mocks.transition,
}));
vi.mock("@/lib/installer/devices", () => ({ sendAssignmentPushToInstaller: mocks.push }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sms }));

const AGENT = { id: "agent-1", name: "김경민", branch: "경영하드웨어" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PII_ENCRYPTION_KEY = "test-pii-key";
  mocks.findInstaller.mockResolvedValue({
    id: "agent-1",
    name: "김경민",
    branch: "경영하드웨어",
    phone: "010-4265-9955",
    active: true,
    // 총판 계정은 능력·지역 조건이 맞지 않아도 대행 배정은 된다.
    capabilities: [],
    aqaraAppCapability: "NONE",
    region: "경기",
    coverage: null,
    serviceAreas: [],
  });
  mocks.findFirstAssignment.mockResolvedValue(null);
  mocks.countAssignments.mockResolvedValue(0);
  mocks.createAssignment.mockResolvedValue({ id: "assignment-1" });
});

function readyOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    status: "READY_FOR_CANDIDATE_SELECTION",
    hasOpenIssue: false,
    source: { memo: "용역 도어락 설치비(K100)+월패드 연동(RF447) x1" },
    activeCustomerRequestId: "request-1",
    activeAssignmentId: null,
    currentInstallerId: null,
    partnerId: null,
    customerRequests: [{ installAddressEncrypted: null, installAddress1Encrypted: null, installDate: "2026-11-15" }],
    ...overrides,
  };
}

describe("assignInstallationOrderToAgent", () => {
  it("assigns to the single agent account and marks the order as agent proxy", async () => {
    const now = new Date("2026-11-09T06:00:00Z");
    mocks.findAgents.mockResolvedValue([AGENT]);
    mocks.findOrderOutsideTx.mockResolvedValue({ status: "READY_FOR_CANDIDATE_SELECTION", currentInstallerId: null, partnerId: null, agentProxy: false });
    mocks.findOrder.mockResolvedValue(readyOrder());

    await assignInstallationOrderToAgent("order-1", {
      adminId: "admin-1",
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "token",
    });

    expect(mocks.createAssignment.mock.calls[0][0].data).toMatchObject({
      installerId: "agent-1",
      assignmentSource: "MANUAL_DIRECT",
      selectionSnapshot: expect.objectContaining({ manualReason: "총판 대행" }),
    });
    const [, , options] = mocks.transition.mock.calls[0];
    expect(options.orderData).toMatchObject({
      currentInstallerId: "agent-1",
      agentProxy: true,
      agentProxyAssignedAt: now,
    });
    expect(options.event.eventType).toBe("MANUAL_ASSIGNMENT_CREATED");
  });

  it("refuses when no agent (or more than one) is configured", async () => {
    mocks.findAgents.mockResolvedValue([]);
    await expect(assignInstallationOrderToAgent("order-1", { adminId: "admin-1" })).rejects.toThrow(
      "AGENT_NOT_CONFIGURED",
    );
    mocks.findAgents.mockResolvedValue([AGENT, { ...AGENT, id: "agent-2" }]);
    await expect(assignInstallationOrderToAgent("order-1", { adminId: "admin-1" })).rejects.toThrow(
      "AGENT_NOT_CONFIGURED",
    );
    expect(mocks.createAssignment).not.toHaveBeenCalled();
  });

  it("refuses an order that is already with the agent as proxy", async () => {
    mocks.findAgents.mockResolvedValue([AGENT]);
    mocks.findOrderOutsideTx.mockResolvedValue({
      status: "INSTALLER_ASSIGNED",
      currentInstallerId: "agent-1",
      partnerId: null,
      agentProxy: true,
    });
    await expect(assignInstallationOrderToAgent("order-1", { adminId: "admin-1" })).rejects.toThrow(
      "ALREADY_AGENT_PROXY",
    );
  });

  it("reassigns an order already with another installer and notifies that installer", async () => {
    mocks.findAgents.mockResolvedValue([AGENT]);
    mocks.findOrderOutsideTx.mockResolvedValue({
      status: "INSTALLER_ASSIGNED",
      currentInstallerId: "installer-9",
      partnerId: null,
      agentProxy: false,
    });
    mocks.findOrder.mockResolvedValue(
      readyOrder({ status: "INSTALLER_ASSIGNED", currentInstallerId: "installer-9", activeAssignmentId: null }),
    );

    await assignInstallationOrderToAgent("order-1", { adminId: "admin-1", tokenFactory: () => "token", baseUrl: "https://example.com" });

    const [, , options] = mocks.transition.mock.calls[0];
    expect(options.event.eventType).toBe("ADMIN_REASSIGNED_INSTALLER");
    expect(options.orderData).toMatchObject({ currentInstallerId: "agent-1", agentProxy: true });
    expect(mocks.push).toHaveBeenCalledWith("installer-9", expect.objectContaining({ title: "설치 배정이 취소되었습니다" }));
  });
});
