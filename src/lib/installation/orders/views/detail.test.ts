import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getInstallationOrderStatusDetail } from "@/lib/installation/orders/views/detail";

const { findUnique, findBackofficeUsers, findInstallers, decryptNullablePii } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findBackofficeUsers: vi.fn(),
  findInstallers: vi.fn(),
  decryptNullablePii: vi.fn((value: string | null | undefined) => value ? `decrypted:${value}` : null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrder: {
      findUnique,
    },
    backofficeUser: {
      findMany: findBackofficeUsers,
    },
    installer: {
      findMany: findInstallers,
    },
  },
}));

vi.mock("@/lib/piiCrypto", () => ({
  decryptNullablePii,
}));

describe("getInstallationOrderStatusDetail", () => {
  it("derives dispatch requirements from the stored source memo for detail candidate filtering", async () => {
    findUnique.mockResolvedValue({
      id: "order-1",
      source: {
        sourceKey: "SO20260611001",
        customerNameEncrypted: null,
        phoneEncrypted: null,
        addressEncrypted: null,
        dueDate: "20260616",
        orderNumbers: "EXT-1",
        noGirl: "GIR-1",
        memo: "[스마트홈 여름 준비 패키지_앱+허브 설치] 용역 도어락 설치비(L100)+월패드 연동(RF447) x1",
      },
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeCustomerRequestId: null,
      activeAssignmentId: null,
      currentInstallerId: null,
      hasOpenIssue: false,
      lastIssueId: null,
      statusChangedAt: new Date("2026-06-11T00:00:00.000Z"),
      customerRequests: [],
      assignmentAttempts: [],
      statusEvents: [
        {
          id: "event-admin",
          fromStatus: "WAITING_ADMIN_REVIEW",
          toStatus: "WAITING_INSTALLER_RESPONSE",
          eventType: "ADMIN_APPROVED",
          actorType: "ADMIN",
          actorId: "admin-1",
          reason: null,
          metadata: null,
          createdAt: new Date("2026-06-11T01:00:00.000Z"),
        },
        {
          id: "event-installer",
          fromStatus: "WAITING_INSTALLER_RESPONSE",
          toStatus: "READY_FOR_CANDIDATE_SELECTION",
          eventType: "INSTALLER_REJECTED",
          actorType: "INSTALLER",
          actorId: "installer-1",
          reason: "일정 조율 불가",
          metadata: null,
          createdAt: new Date("2026-06-11T02:00:00.000Z"),
        },
      ],
      issues: [],
      notifications: [],
      candidateRuns: [],
    });
    findBackofficeUsers.mockResolvedValue([
      { id: "admin-1", emailEncrypted: "admin-email" },
    ]);
    findInstallers.mockResolvedValue([
      { id: "installer-1", name: "송지용", branch: "지용열쇠", phone: "01091703550" },
    ]);

    const detail = await getInstallationOrderStatusDetail("order-1");

    expect(detail).toMatchObject({
      requiredCapabilities: JSON.stringify(["DOORLOCK", "WALLPAD_HUB"]),
      requiredAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
      statusEvents: [
        expect.objectContaining({
          actorEmail: "decrypted:admin-email",
          actorInstallerName: null,
        }),
        expect.objectContaining({
          actorEmail: null,
          actorInstallerName: "송지용",
          actorInstallerBranch: "지용열쇠",
          actorInstallerPhone: "01091703550",
        }),
      ],
    });
    expect(detail?.statusEvents[0]).not.toHaveProperty("actorId");
    expect(detail?.statusEvents[1]).not.toHaveProperty("actorId");
    expect(prisma.installationOrder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order-1" } }),
    );
    expect(prisma.installationOrder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          assignmentAttempts: expect.objectContaining({ orderBy: { createdAt: "desc" } }),
          statusEvents: expect.objectContaining({ orderBy: { createdAt: "desc" } }),
        }),
      }),
    );
    expect(findBackofficeUsers).toHaveBeenCalledWith({
      where: { id: { in: ["admin-1"] } },
      select: { id: true, emailEncrypted: true },
    });
    expect(findInstallers).toHaveBeenCalledWith({
      where: { id: { in: ["installer-1"] } },
      select: { id: true, name: true, branch: true, phone: true },
    });
  });
});
