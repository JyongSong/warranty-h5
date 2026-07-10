import { describe, expect, it, vi } from "vitest";
import {
  getInstallerContact,
  listDispatchCandidateInstallers,
  listReviewInstallersById,
} from "@/lib/installation/installer/source";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

describe("installation installer source", () => {
  it("maps installers page fields into dispatch candidate installers", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "installer-1",
        name: "서울강남기사",
        phone: "010-1111-2222",
        branch: "서울강남지점",
        region: "서울",
        coverage: "강남구, 서초구",
        serviceAreas: ["서울 강남구"],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 3,
        active: true,
      },
    ]);
    const findManyAssignments = vi.fn().mockResolvedValue([
      {
        installerId: "installer-1",
        createdAt: new Date("2026-06-10T00:00:00.000Z"),
      },
    ]);

    const result = await listDispatchCandidateInstallers({}, {
      installer: { findMany },
      installationInstallerAssignmentAttempt: { findMany: findManyAssignments },
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ monthlyDispatchCount: "asc" }, { id: "asc" }],
      select: expect.objectContaining({
        id: true,
        name: true,
        phone: true,
        branch: true,
        region: true,
        coverage: true,
        serviceAreas: true,
        capabilities: true,
        aqaraAppCapability: true,
        monthlyDispatchCount: true,
        active: true,
      }),
    });
    expect(result).toEqual([
      expect.objectContaining({
        businessNumber: "installer-1",
        branchName: "서울강남지점",
        phone: "010-1111-2222",
        installationRegion: "서울",
        possibleRegion: "서울 강남구",
        impossibleRegion: "",
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 3,
        lastRequestedAt: new Date("2026-06-10T00:00:00.000Z"),
        active: true,
      }),
    ]);
    expect(findManyAssignments).toHaveBeenCalledWith({
      where: {
        installerId: { in: ["installer-1"] },
        assignmentSource: "AUTO",
      },
      orderBy: { createdAt: "desc" },
      distinct: ["installerId"],
      select: {
        installerId: true,
        createdAt: true,
      },
    });
  });

  it("filters dispatch candidates by required capabilities", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await listDispatchCandidateInstallers(
      { requiredCapabilities: ["DOORLOCK", "WALLPAD_HUB"] },
      { installer: { findMany } },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          active: true,
          capabilities: { hasEvery: ["DOORLOCK", "WALLPAD_HUB"] },
        },
      }),
    );
  });

  it("does not add a capability filter when required capabilities are blank", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await listDispatchCandidateInstallers(
      { requiredCapabilities: ["", "DOORLOCK"] },
      { installer: { findMany } },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          active: true,
          capabilities: { hasEvery: ["DOORLOCK"] },
        },
      }),
    );

    findMany.mockClear();
    await listDispatchCandidateInstallers(
      { requiredCapabilities: [""] },
      { installer: { findMany } },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true },
      }),
    );
  });

  it("uses row defaults when optional installer fields are missing", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "installer-1",
        name: "기본값기사",
        phone: "010-1111-1111",
        branch: " ",
        region: null,
        coverage: null,
        serviceAreas: [],
      },
    ]);

    const result = await listDispatchCandidateInstallers({}, { installer: { findMany } });

    expect(result).toEqual([
      expect.objectContaining({
        businessNumber: "installer-1",
        branchName: "기본값기사",
        installationRegion: "",
        possibleRegion: "",
        capabilities: [],
        aqaraAppCapability: "NONE",
        hasAqaraHubInventory: false,
        monthlyDispatchCount: 0,
        lastRequestedAt: null,
        active: true,
      }),
    ]);
  });

  it("keeps only installers whose Aqara app capability is at or above the required level", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "installer-1",
        name: "앱불가기사",
        phone: "010-1111-1111",
        branch: null,
        region: "서울",
        coverage: "강남구",
        serviceAreas: [],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "NONE",
        monthlyDispatchCount: 0,
        active: true,
      },
      {
        id: "installer-2",
        name: "앱가능기사",
        phone: "010-2222-2222",
        branch: null,
        region: "서울",
        coverage: "강남구",
        serviceAreas: [],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP",
        monthlyDispatchCount: 1,
        active: true,
      },
      {
        id: "installer-3",
        name: "허브가능기사",
        phone: "010-3333-3333",
        branch: null,
        region: "서울",
        coverage: "강남구",
        serviceAreas: [],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
        monthlyDispatchCount: 2,
        active: true,
      },
    ]);

    const result = await listDispatchCandidateInstallers(
      { requiredAqaraAppCapability: "DOORLOCK_AND_APP" },
      { installer: { findMany } },
    );

    expect(result.map((installer) => installer.businessNumber)).toEqual([
      "installer-2",
      "installer-3",
    ]);
  });

  it("does not use Aqara hub inventory for dispatch filtering or sorting", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "installer-1",
        name: "허브미보유기사",
        phone: "010-1111-1111",
        branch: null,
        region: "서울",
        coverage: "강남구",
        serviceAreas: [],
        capabilities: ["DOORLOCK"],
        aqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
        hasAqaraHubInventory: false,
        monthlyDispatchCount: 0,
        active: true,
      },
    ]);

    const result = await listDispatchCandidateInstallers(
      { requiredAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB" },
      { installer: { findMany } },
    );

    expect(result.map((installer) => installer.businessNumber)).toEqual(["installer-1"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        where: expect.objectContaining({ hasAqaraHubInventory: expect.anything() }),
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        orderBy: expect.arrayContaining([
          expect.objectContaining({ hasAqaraHubInventory: expect.anything() }),
        ]),
      }),
    );
  });

  it("loads review installer display data by id", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "installer-1",
        name: "서울강남기사",
        phone: "010-1111-2222",
        branch: null,
        region: "서울",
        coverage: "강남구",
        serviceAreas: [],
      },
    ]);

    const result = await listReviewInstallersById(["installer-1"], {
      installer: { findMany },
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ["installer-1"] } },
      select: expect.any(Object),
    });
    expect(result.get("installer-1")).toEqual({
      businessNumber: "installer-1",
      branchName: "서울강남기사",
      phone: "010-1111-2222",
      installationRegion: "서울",
      possibleRegion: "강남구",
      impossibleRegion: null,
    });
  });

  it("returns an empty review installer map without querying when ids are blank", async () => {
    const findMany = vi.fn();

    const result = await listReviewInstallersById(["", ""], {
      installer: { findMany },
    });

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("uses service areas before coverage for review installer possible regions", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "installer-1",
        name: "서울기사",
        phone: "010-1111-2222",
        branch: "서울지점",
        region: "서울",
        coverage: "서울 전체",
        serviceAreas: ["서울 강남구", "서울 서초구"],
      },
    ]);

    const result = await listReviewInstallersById(["installer-1"], {
      installer: { findMany },
    });

    expect(result.get("installer-1")).toEqual({
      businessNumber: "installer-1",
      branchName: "서울지점",
      phone: "010-1111-2222",
      installationRegion: "서울",
      possibleRegion: "서울 강남구, 서울 서초구",
      impossibleRegion: null,
    });
  });

  it("loads installer contact by id for assignment request SMS", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "installer-1",
      phone: "010-1111-2222",
    });

    await expect(
      getInstallerContact("installer-1", { installer: { findUnique } }),
    ).resolves.toEqual({
      id: "installer-1",
      phone: "010-1111-2222",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "installer-1" },
      select: {
        id: true,
        name: true,
        branch: true,
        phone: true,
        region: true,
        coverage: true,
        serviceAreas: true,
        active: true,
        capabilities: true,
        aqaraAppCapability: true,
      },
    });
  });
});
