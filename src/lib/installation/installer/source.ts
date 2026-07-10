import { prisma } from "@/lib/prisma";
import type { InstallationOrderInstaller } from "@/lib/installation/installer/matcher";

export type InstallerSourceClient = {
  installer: {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  installationInstallerAssignmentAttempt?: {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
};

export type InstallerContactClient = {
  installer: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      name?: string;
      branch?: string | null;
      phone: string;
      region?: string | null;
      coverage?: string | null;
      serviceAreas?: string[];
      active?: boolean;
      capabilities?: string[];
      aqaraAppCapability?: string;
    } | null>;
  };
};

export type DispatchCandidateInstaller = InstallationOrderInstaller & {
  serviceAreas: string[];
  capabilities: string[];
  aqaraAppCapability: string;
  hasAqaraHubInventory: boolean;
  monthlyDispatchCount: number;
  lastRequestedAt: Date | null;
  active: boolean;
};

type ListDispatchCandidateInstallersOptions = {
  requiredCapabilities?: string[];
  requiredAqaraAppCapability?: string;
};

const AQARA_APP_CAPABILITY_RANK: Record<string, number> = {
  NONE: 0,
  DOORLOCK_AND_APP: 1,
  DOORLOCK_AND_APP_AND_HUB: 2,
};

type InstallerRow = {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  coverage: string | null;
  serviceAreas: string[];
  capabilities?: string[];
  aqaraAppCapability?: string;
  hasAqaraHubInventory?: boolean;
  monthlyDispatchCount?: number;
  lastRequestedAt?: Date | null;
  active?: boolean;
};

type InstallerLastRequestRow = {
  installerId: string;
  createdAt: Date;
};

export async function listDispatchCandidateInstallers(
  options: ListDispatchCandidateInstallersOptions = {},
  client: InstallerSourceClient = prisma as unknown as InstallerSourceClient,
): Promise<DispatchCandidateInstaller[]> {
  const requiredCapabilities = options.requiredCapabilities?.filter(Boolean) ?? [];
  const installers = await client.installer.findMany({
    where: {
      active: true,
      ...(requiredCapabilities.length > 0
        ? { capabilities: { hasEvery: requiredCapabilities } }
        : {}),
    },
    orderBy: [{ monthlyDispatchCount: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      phone: true,
      branch: true,
      region: true,
      coverage: true,
      serviceAreas: true,
      capabilities: true,
      aqaraAppCapability: true,
      hasAqaraHubInventory: true,
      monthlyDispatchCount: true,
      active: true,
    },
  });

  const installerRows = installers as InstallerRow[];
  const lastRequestedAtByInstallerId = await listLastRequestedAtByInstallerId(
    installerRows.map((installer) => installer.id),
    client,
  );

  return installerRows
    .map(toDispatchCandidateInstaller)
    .map((installer) => ({
      ...installer,
      lastRequestedAt:
        lastRequestedAtByInstallerId.get(installer.businessNumber) ??
        installer.lastRequestedAt ??
        null,
    }))
    .filter((installer) =>
      canSupportAqaraAppCapability(
        installer.aqaraAppCapability,
        options.requiredAqaraAppCapability ?? "NONE",
      ),
    );
}

export async function listReviewInstallersById(
  installerIds: string[],
  client: InstallerSourceClient = prisma as unknown as InstallerSourceClient,
) {
  const uniqueIds = Array.from(new Set(installerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, InstallationOrderInstaller>();

  const installers = await client.installer.findMany({
    where: { id: { in: uniqueIds } },
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

  return new Map(
    (installers as InstallerRow[]).map((installer) => [
      installer.id,
      toReviewInstaller(installer),
    ]),
  );
}

export async function getInstallerContact(
  installerId: string,
  client: InstallerContactClient = prisma as unknown as InstallerContactClient,
) {
  return client.installer.findUnique({
    where: { id: installerId },
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
}

function toDispatchCandidateInstaller(installer: InstallerRow): DispatchCandidateInstaller {
  return {
    businessNumber: installer.id,
    branchName: installer.branch?.trim() || installer.name,
    phone: installer.phone,
    installationRegion: installer.region ?? "",
    possibleRegion: getPossibleRegion(installer),
    impossibleRegion: "",
    serviceAreas: installer.serviceAreas,
    capabilities: installer.capabilities ?? [],
    aqaraAppCapability: installer.aqaraAppCapability ?? "NONE",
    hasAqaraHubInventory: installer.hasAqaraHubInventory ?? false,
    monthlyDispatchCount: installer.monthlyDispatchCount ?? 0,
    lastRequestedAt: installer.lastRequestedAt ?? null,
    active: installer.active ?? true,
  };
}

function toReviewInstaller(installer: InstallerRow): InstallationOrderInstaller {
  return {
    businessNumber: installer.id,
    branchName: installer.branch?.trim() || installer.name,
    phone: installer.phone,
    installationRegion: installer.region,
    possibleRegion: getPossibleRegion(installer) || null,
    impossibleRegion: null,
  };
}

function getPossibleRegion(installer: InstallerRow) {
  return installer.serviceAreas.length > 0
    ? installer.serviceAreas.join(", ")
    : installer.coverage ?? "";
}

function canSupportAqaraAppCapability(candidate: string, required: string) {
  const requiredRank = AQARA_APP_CAPABILITY_RANK[required] ?? 0;
  if (requiredRank === 0) return true;

  return (AQARA_APP_CAPABILITY_RANK[candidate] ?? 0) >= requiredRank;
}

async function listLastRequestedAtByInstallerId(
  installerIds: string[],
  client: InstallerSourceClient,
) {
  if (!client.installationInstallerAssignmentAttempt || installerIds.length === 0) {
    return new Map<string, Date>();
  }

  const rows = await client.installationInstallerAssignmentAttempt.findMany({
    where: {
      installerId: { in: installerIds },
      assignmentSource: "AUTO",
    },
    orderBy: { createdAt: "desc" },
    distinct: ["installerId"],
    select: {
      installerId: true,
      createdAt: true,
    },
  });

  return new Map(
    (rows as InstallerLastRequestRow[]).map((row) => [row.installerId, row.createdAt]),
  );
}
