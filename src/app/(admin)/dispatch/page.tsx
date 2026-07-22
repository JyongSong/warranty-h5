import { requireAdminPage } from "@/lib/adminAuth";
import DispatchClient from "./DispatchClient";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  await requireAdminPage("/dispatch");
  return <DispatchClient />;
}
