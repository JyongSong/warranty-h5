import { requireAdminPage } from "@/lib/adminAuth";
import { getBaseUrl } from "@/lib/getBaseUrl";
import ProfileSmsClient from "./ProfileSmsClient";

export const dynamic = "force-dynamic";

export default async function BackofficeInstallerProfileSmsPage() {
  // 발송 액션이 등급 1 을 요구하므로 화면도 같은 등급으로 막는다.
  await requireAdminPage("/backoffice/installers/profile-sms", 1);

  return <ProfileSmsClient baseUrl={getBaseUrl()} />;
}
