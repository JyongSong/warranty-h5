import { requireInstallerPage } from "@/lib/installer/session";
import GuideClient from "./GuideClient";

export const dynamic = "force-dynamic";

export default async function InstallerGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  await requireInstallerPage("/installer/guide");
  const { first } = await searchParams;

  return <GuideClient mode={first === "1" ? "first-visit" : "revisit"} />;
}
