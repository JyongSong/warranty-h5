import { requireAdminPage } from "@/lib/adminAuth";
import { BROADCAST_LIMITS } from "@/lib/installer/broadcast";
import BroadcastClient from "./BroadcastClient";

export const dynamic = "force-dynamic";
// 수백 명에게 푸시·문자를 차례로 보내므로 넉넉히 둔다.
export const maxDuration = 300;

export default async function BackofficeInstallerBroadcastPage() {
  await requireAdminPage("/backoffice/installers/broadcast", "edit");
  return <BroadcastClient limits={BROADCAST_LIMITS} />;
}
