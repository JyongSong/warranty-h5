import { requireAdminPage } from "@/lib/adminAuth";
import InstallersClient from "./InstallersClient";

export default async function InstallersPage() {
  const admin = await requireAdminPage("/installers");

  return <InstallersClient admin={admin} />;
}
