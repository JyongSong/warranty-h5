import { canEditBackoffice } from "@/lib/login/backofficeRoles";
import { requireAdminPage } from "@/lib/adminAuth";
import { listSettlementInfoAdminRows } from "@/lib/installer/settlement-info-admin";
import SettlementInfoAdminClient from "./SettlementInfoAdminClient";

export const dynamic = "force-dynamic";

export default async function BackofficeSettlementInfoAdminPage() {
  const admin = await requireAdminPage("/backoffice/installers/settlement-info");
  const rows = await listSettlementInfoAdminRows();
  return <SettlementInfoAdminClient rows={rows} canEdit={canEditBackoffice(admin.level)} />;
}
