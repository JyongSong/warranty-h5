import { requireAdminPage } from "@/lib/adminAuth";
import RegistrationsClient from "./RegistrationsClient";

export default async function BackofficeRegistrationsPage() {
  const admin = await requireAdminPage("/backoffice/registrations");

  return <RegistrationsClient admin={admin} />;
}
