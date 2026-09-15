import { prisma } from "@/lib/prisma";
import type { InstallerProfileInput } from "./profile-input";

export * from "./profile-input";

/**
 * 본인 정보를 저장한다. 대상은 항상 세션의 기사 본인이고, 바꾸는 항목도
 * 위 네 가지로 한정된다. 다른 컬럼은 건드리지 않는다.
 */
export async function saveInstallerProfile(installerId: string, input: InstallerProfileInput) {
  await prisma.installer.update({
    where: { id: installerId },
    data: {
      name: input.name,
      address: input.address,
      aqaraAppCapability: input.aqaraAppCapability,
      asEmergencyAvailability: input.asEmergencyAvailability,
      profileConfirmedAt: new Date(),
    },
  });
}

export async function getInstallerProfile(installerId: string) {
  return prisma.installer.findUnique({
    where: { id: installerId },
    select: {
      id: true,
      name: true,
      phone: true,
      branch: true,
      region: true,
      address: true,
      serviceAreas: true,
      capabilities: true,
      aqaraAppCapability: true,
      asEmergencyAvailability: true,
      profileConfirmedAt: true,
    },
  });
}
