import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import AttentionAlertSettingsPanel from "./AttentionAlertSettingsPanel";

// 알림 설정은 브라우저마다 따로 저장되므로 조회 전용 계정도 자기 화면에서 켜고 끌 수 있다.
export default async function NotificationSettingsPage() {
  await requireBackofficeUserPage("/backoffice/settings/notifications");

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="알림 설정" />
      <AttentionAlertSettingsPanel />
    </div>
  );
}
