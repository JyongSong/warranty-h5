import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveInstallerCompletion,
  submitInstallerCompletion,
  type SubmitCompletionInput,
} from "@/lib/installation/completion/service";

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(),
  upsertCompletion: vi.fn(),
  findCompletion: vi.fn(),
  updateCompletion: vi.fn(),
  transition: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    installationOrder: { findUnique: mocks.findOrder },
    installationCompletion: {
      upsert: mocks.upsertCompletion,
      findUnique: mocks.findCompletion,
      update: mocks.updateCompletion,
    },
    installationInstallerAssignmentAttempt: { updateMany: vi.fn() },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    },
  };
});
vi.mock("@/lib/installation/orders/status", () => ({
  INSTALLATION_ORDER_STATUSES: {
    INSTALLER_ASSIGNED: "INSTALLER_ASSIGNED",
    WAITING_HQ_REVIEW: "WAITING_HQ_REVIEW",
    COMPLETED: "COMPLETED",
  },
  transitionInstallationOrderStatus: mocks.transition,
}));
vi.mock("@/lib/installation/settlement/snapshot", () => ({ createInstallSettlementSnapshot: mocks.snapshot }));
vi.mock("@/lib/installation/wallpad/service", () => ({
  recordCompletionWallpadCase: vi.fn().mockResolvedValue(null),
  fillCompletionCaseSiteName: vi.fn(),
}));
vi.mock("@/lib/installer/storage", () => ({ getCompletionPhotoSignedUrls: vi.fn() }));
vi.mock("@/lib/installer/devices", () => ({ sendAssignmentPushToInstaller: vi.fn() }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));

function input(overrides: Partial<SubmitCompletionInput> = {}): SubmitCompletionInput {
  return {
    installerId: "agent-1",
    orderId: "order-1",
    achievedAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
    wallpadLinked: true,
    wallpadAmount: 30000,
    wallpadResult: "SUCCESS",
    wallpadBilling: "HQ",
    longDistanceAmount: 40000,
    linkagePhotoPaths: ["orders/order-1/l.jpg"],
    extraClaimAmount: 30000,
    extraClaimReason: "현지 기사 추가 비용",
    installEndAt: new Date("2026-11-12T05:30:00Z"),
    photoPaths: [],
    agentProxyBaseFee: 60000,
    actualInstaller: "  이영호   010-1234-5678 ",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitInstallerCompletion — 총판 대행 건", () => {
  beforeEach(() => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      currentInstallerId: "agent-1",
      status: "INSTALLER_ASSIGNED",
      agentProxy: true,
    });
  });

  it("accepts zero photos and stores only base fee + extra claim, dropping linkage/wallpad/long distance", async () => {
    await submitInstallerCompletion(input());

    const { create } = mocks.upsertCompletion.mock.calls[0][0];
    expect(create).toMatchObject({
      achievedAqaraAppCapability: "NONE",
      wallpadLinked: false,
      wallpadAmount: null,
      wallpadBilling: null,
      wallpadResult: "NOT_ATTEMPTED",
      longDistanceAmount: null,
      linkagePhotoPaths: [],
      extraClaimAmount: 30000,
      agentProxyBaseFee: 60000,
      actualInstaller: "이영호 010-1234-5678",
      photoPaths: [],
    });
  });

  it("requires a valid base fee", async () => {
    await expect(submitInstallerCompletion(input({ agentProxyBaseFee: null }))).rejects.toThrow(
      "AGENT_PROXY_BASE_FEE_INVALID",
    );
    await expect(submitInstallerCompletion(input({ agentProxyBaseFee: -1 }))).rejects.toThrow(
      "AGENT_PROXY_BASE_FEE_INVALID",
    );
    expect(mocks.upsertCompletion).not.toHaveBeenCalled();
  });
});

describe("submitInstallerCompletion — 일반 건", () => {
  beforeEach(() => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      currentInstallerId: "agent-1",
      status: "INSTALLER_ASSIGNED",
      agentProxy: false,
    });
  });

  it("still requires at least one photo and ignores agent-proxy fields", async () => {
    await expect(submitInstallerCompletion(input())).rejects.toThrow("PHOTO_COUNT_INVALID");

    await submitInstallerCompletion(input({ photoPaths: ["orders/order-1/a.jpg"] }));
    const { create } = mocks.upsertCompletion.mock.calls[0][0];
    expect(create).toMatchObject({
      achievedAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
      agentProxyBaseFee: null,
      actualInstaller: null,
    });
  });
});

describe("approveInstallerCompletion — 대행 기본 출장비", () => {
  beforeEach(() => {
    mocks.findOrder.mockResolvedValue({ id: "order-1", status: "WAITING_HQ_REVIEW", activeAssignmentId: null });
  });

  it("lets HQ set the base fee on an agent-proxy completion", async () => {
    mocks.findCompletion.mockResolvedValue({ agentProxyBaseFee: 60000 });
    await approveInstallerCompletion({ adminId: "admin-1", orderId: "order-1", agentProxyBaseFee: 50000 });
    expect(mocks.updateCompletion.mock.calls[0][0].data).toMatchObject({
      reviewStatus: "APPROVED",
      agentProxyBaseFee: 50000,
    });
    expect(mocks.snapshot).toHaveBeenCalled();
  });

  it("refuses a base fee on a normal completion", async () => {
    mocks.findCompletion.mockResolvedValue({ agentProxyBaseFee: null });
    await expect(
      approveInstallerCompletion({ adminId: "admin-1", orderId: "order-1", agentProxyBaseFee: 50000 }),
    ).rejects.toThrow("NOT_AGENT_PROXY_COMPLETION");
    expect(mocks.updateCompletion).not.toHaveBeenCalled();
  });
});
