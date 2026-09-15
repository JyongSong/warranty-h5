import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerProfile } from "@/lib/installer/profile";
import ProfileEditClient from "./ProfileEditClient";

export const dynamic = "force-dynamic";

export default async function InstallerProfileEditPage() {
  const session = await requireInstallerPage("/installer/me/edit");
  const profile = await getInstallerProfile(session.id);
  if (!profile) notFound();

  return (
    <ProfileEditClient
      profile={{
        name: profile.name,
        phone: profile.phone,
        branch: profile.branch,
        region: profile.region,
        address: profile.address,
        serviceAreas: profile.serviceAreas,
        capabilities: profile.capabilities,
        aqaraAppCapability: profile.aqaraAppCapability,
        asEmergencyAvailability: profile.asEmergencyAvailability,
        confirmed: Boolean(profile.profileConfirmedAt),
      }}
    />
  );
}
