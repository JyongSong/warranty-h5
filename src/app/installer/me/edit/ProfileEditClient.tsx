"use client";

import ProfileForm, { type Profile } from "@/app/i/p/ProfileForm";
import { saveInstallerProfileAction } from "./actions";

// 기사 앱 안에서 쓰는 입구. 이미 앱 세션이 있으므로 인증 단계 없이 폼만 띄운다.
export default function ProfileEditClient({ profile }: { profile: Profile }) {
  return <ProfileForm profile={profile} onSave={saveInstallerProfileAction} />;
}
