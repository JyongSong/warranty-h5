import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { getInstallationSmsTemplatePreviews } from "@/lib/installation/notifications/sms-template-preview";
import BackofficePageHeader from "../../BackofficePageHeader";
import SmsTemplateClient from "./SmsTemplateClient";

export default async function SmsTemplatePreviewPage() {
  await requireBackofficeUserPage("/backoffice/settings/sms-templates", 1);
  const templates = getInstallationSmsTemplatePreviews();

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="SMS 템플릿" />
      <SmsTemplateClient templates={templates} />
    </div>
  );
}
