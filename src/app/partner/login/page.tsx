import { redirect } from "next/navigation";
import { getAuthPartner } from "@/lib/partnerAuth";
import PartnerLoginClient from "./PartnerLoginClient";

export const dynamic = "force-dynamic";

export default async function PartnerLoginPage() {
  const partner = await getAuthPartner();
  if (partner) {
    redirect("/partner/cj");
  }

  return <PartnerLoginClient />;
}
