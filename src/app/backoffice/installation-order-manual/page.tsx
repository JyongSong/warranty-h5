import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { getNextAdminManualOrderNumber } from "@/lib/installation/orders/source/admin-create";
import BackofficePageHeader from "../BackofficePageHeader";
import ManualOrderPanel from "./ManualOrderPanel";

export const dynamic = "force-dynamic";

export default async function InstallationOrderManualPage() {
  await requireBackofficeUserPage("/backoffice/installation-order-manual", "edit");
  const nextOrderNumber = await getNextAdminManualOrderNumber();

  return (
    <section>
      <div className="px-6 py-7 lg:px-8">
        <BackofficePageHeader title="주문 직접 입력" />
        <ManualOrderPanel initialOrderNumber={nextOrderNumber} />
      </div>
    </section>
  );
}
