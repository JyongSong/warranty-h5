"use client";

import ProfileForm, { type Profile } from "./ProfileForm";
import { saveProfileAction } from "./actions";

export default function ProfileFormClient({ profile }: { profile: Profile }) {
  return <ProfileForm profile={profile} onSave={saveProfileAction} />;
}
