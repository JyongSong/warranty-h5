import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";

export default async function BackofficeSettingsPage() {
  await requireBackofficeUserPage("/backoffice/settings", 1);

  return <div className="min-h-screen bg-white" />;
}
