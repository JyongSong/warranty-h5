import { requireAdminPage } from "@/lib/adminAuth";
import InstallersClient from "./InstallersClient";

export default async function BackofficeInstallersPage() {
  const admin = await requireAdminPage("/backoffice/installers");

  return <InstallersClient admin={admin} />;
}
