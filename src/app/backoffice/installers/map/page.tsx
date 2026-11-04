import { canEditBackoffice } from "@/lib/login/backofficeRoles";
import { requireAdminPage } from "@/lib/adminAuth";
import {
  listActiveInstallerLocations,
  needsInstallerGeocoding,
  normalizeInstallerAddress,
} from "@/lib/installation/distance/service";
import InstallerMapClient from "./InstallerMapClient";

export const dynamic = "force-dynamic";

export default async function BackofficeInstallerMapPage() {
  const admin = await requireAdminPage("/backoffice/installers/map");
  const installers = await listActiveInstallerLocations();

  return (
    <InstallerMapClient
      canSyncCoordinates={canEditBackoffice(admin.level)}
      markers={installers.flatMap((installer) =>
        installer.point
          ? [
              {
                id: installer.id,
                name: installer.name,
                branch: installer.branch,
                phone: installer.phone,
                ...installer.point,
              },
            ]
          : [],
      )}
      counts={{
        total: installers.length,
        noAddress: installers.filter((installer) => !normalizeInstallerAddress(installer.address)).length,
        pending: installers.filter(needsInstallerGeocoding).length,
        notFound: installers.filter(
          (installer) =>
            normalizeInstallerAddress(installer.address) && !needsInstallerGeocoding(installer) && !installer.point,
        ).length,
      }}
    />
  );
}
