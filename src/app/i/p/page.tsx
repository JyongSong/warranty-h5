import { getInstallerProfile } from "@/lib/installer/profile";
import { getProfileSessionInstallerId } from "@/lib/installer/profile-session";
import ProfileFormClient from "./ProfileFormClient";
import VerifyClient from "./VerifyClient";

export const dynamic = "force-dynamic";

// 문자로 보내는 링크. 기사 앱(/installer/*) 밖에 있어 하단 탭이나 푸시 등록이
// 딸려오지 않고, 인증해도 앱 세션이 아니라 이 화면 전용 쿠키만 생긴다.
export default async function InstallerProfilePage() {
  const installerId = await getProfileSessionInstallerId();
  if (!installerId) return <VerifyClient />;

  const profile = await getInstallerProfile(installerId);
  // 쿠키는 살아 있는데 기사가 사라진 경우(삭제 등) 인증부터 다시 받는다.
  if (!profile) return <VerifyClient />;

  return (
    <ProfileFormClient
      profile={{
        name: profile.name,
        phone: profile.phone,
        branch: profile.branch,
        region: profile.region,
        address: profile.address,
        capabilities: profile.capabilities,
        aqaraAppCapability: profile.aqaraAppCapability,
        asEmergencyAvailability: profile.asEmergencyAvailability,
        confirmed: Boolean(profile.profileConfirmedAt),
      }}
    />
  );
}
