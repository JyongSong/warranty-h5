import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../BackofficePageHeader";
import ManualOrderPanel from "./ManualOrderPanel";

export const dynamic = "force-dynamic";

export default async function InstallationOrderManualPage() {
  await requireBackofficeUserPage("/backoffice/installation-order-manual", "edit");

  return (
    <section>
      <div className="px-6 py-7 lg:px-8">
        <BackofficePageHeader title="주문 직접 입력" />
        <ManualOrderPanel />
      </div>
    </section>
  );
}
