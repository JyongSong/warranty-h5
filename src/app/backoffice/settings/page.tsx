import { redirect } from "next/navigation";

export default async function BackofficeSettingsPage() {
  // The settings item is a menu group, not a content page. Leaving this route
  // empty makes a slow navigation look like a blank page, so always land on a
  // concrete settings screen instead.
  redirect("/backoffice/settings/users");
}
