import { requireAdminPage } from "@/lib/adminAuth";
import RegistrationsClient from "./RegistrationsClient";

export default async function RegistrationsPage() {
  const admin = await requireAdminPage("/registrations");

  return <RegistrationsClient admin={admin} />;
}
