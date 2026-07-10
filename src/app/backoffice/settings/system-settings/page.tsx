import { listSystemSettings } from "@/lib/backoffice/system-settings";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import SystemSettingsEditor from "./SystemSettingsEditor";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  await requireBackofficeUserPage("/backoffice/settings/system-settings", 1);
  const settings = await listSystemSettings();

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="시스템 설정" />

      <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <SystemSettingsEditor settings={settings} />
      </section>
    </div>
  );
}
