import { notFound } from "next/navigation";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { getAsOrderForAdmin } from "@/lib/installation/as/service";
import AsAdminDetailClient from "./AsAdminDetailClient";

export const dynamic = "force-dynamic";

export default async function AsAdminDetailPage({
  params,
}: {
  params: Promise<{ asId: string }>;
}) {
  const { asId } = await params;
  await requireBackofficeUserPage(`/backoffice/as/${asId}`, 1);
  const detail = await getAsOrderForAdmin(asId);
  if (!detail) notFound();

  return <AsAdminDetailClient detail={detail} />;
}
