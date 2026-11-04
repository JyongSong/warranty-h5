import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { AS_SYMPTOM_CATEGORIES } from "@/lib/installation/as/symptom-codes";
import AsRegisterClient from "./AsRegisterClient";

export const dynamic = "force-dynamic";

export default async function AsRegisterPage() {
  await requireBackofficeUserPage("/backoffice/as/register", "edit");
  return <AsRegisterClient categories={AS_SYMPTOM_CATEGORIES} />;
}
