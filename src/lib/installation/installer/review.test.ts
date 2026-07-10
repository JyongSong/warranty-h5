import { beforeEach, describe, expect, it, vi } from "vitest";
import { listActiveInstallerRequestAssignments } from "@/lib/installation/installer/review";

const { findManyAssignments, findManyInstallers } = vi.hoisted(() => ({
  findManyAssignments: vi.fn(),
  findManyInstallers: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationInstallerAssignmentAttempt: {
      findMany: findManyAssignments,
    },
    installer: {
      findMany: findManyInstallers,
    },
  },
}));

describe("listActiveInstallerRequestAssignments", () => {
  beforeEach(() => {
    findManyAssignments.mockReset();
    findManyInstallers.mockReset();
  });

  it("loads active installer request assignments with order and customer request context", async () => {
    findManyAssignments.mockResolvedValue([
      {
        id: "assignment-1",
        installerId: "installer-1",
        installationOrder: {
          activeAssignmentId: "assignment-1",
          sourceCustomerName: null,
          sourcePhoneEncrypted: null,
          sourceAddressEncrypted: null,
          customerRequests: [],
        },
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
      },
    ]);

    const result = await listActiveInstallerRequestAssignments({ limit: 20 });

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "assignment-1",
        installer: expect.objectContaining({
          businessNumber: "installer-1",
          branchName: "서울강남지점",
          phone: "010-1111-2222",
        }),
      }),
    );
    expect(findManyAssignments).toHaveBeenCalledWith({
      where: {
        status: "WAITING_ADMIN_REVIEW",
        installationOrder: {
          status: "WAITING_ADMIN_REVIEW",
          activeAssignmentId: { not: null },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: expect.objectContaining({
        id: true,
        installerId: true,
        installationOrder: expect.any(Object),
      }),
    });
    expect(findManyInstallers).toHaveBeenCalledWith({
      where: { id: { in: ["installer-1"] } },
      select: {
        id: true,
        name: true,
        phone: true,
        branch: true,
        region: true,
        coverage: true,
        serviceAreas: true,
      },
    });
  });

  it("omits stale review assignments that are no longer the order active assignment", async () => {
    findManyAssignments.mockResolvedValue([
      {
        id: "assignment-old",
        installerId: "installer-1",
        installationOrder: {
          activeAssignmentId: "assignment-current",
          sourceCustomerName: null,
          sourcePhoneEncrypted: null,
          sourceAddressEncrypted: null,
          customerRequests: [],
        },
      },
    ]);

    const result = await listActiveInstallerRequestAssignments({ limit: 20 });

    expect(result).toEqual([]);
    expect(findManyInstallers).not.toHaveBeenCalled();
  });
});
