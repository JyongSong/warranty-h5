import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerAsOrderView, getInstallerAsSubmission } from "@/lib/installer/asOrders";
import AsDetailClient from "./AsDetailClient";

export const dynamic = "force-dynamic";

export default async function InstallerAsDetailPage({
  params,
}: {
  params: Promise<{ asId: string }>;
}) {
  const { asId } = await params;
  const installer = await requireInstallerPage(`/installer/as/${asId}`);
  const item = await getInstallerAsOrderView(installer.id, asId);
  if (!item) notFound();

  // 처리 완료를 등록한 건은 등록한 내용을 함께 보여 준다.
  const submission = item.status === "PENDING" ? null : await getInstallerAsSubmission(installer.id, asId);

  return <AsDetailClient item={item} submission={submission} />;
}
