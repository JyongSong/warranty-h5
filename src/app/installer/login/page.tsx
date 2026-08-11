import { redirect } from "next/navigation";
import { getCurrentInstaller } from "@/lib/installer/session";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function InstallerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const params = await searchParams;
  const raw = typeof params.redirect_url === "string" ? params.redirect_url : "/installer";
  const redirectUrl = raw.startsWith("/installer") ? raw : "/installer";

  const installer = await getCurrentInstaller();
  if (installer) redirect(redirectUrl);

  return <LoginClient redirectUrl={redirectUrl} />;
}
