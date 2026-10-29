import { requireAdminPage } from "@/lib/adminAuth";
import CjRegLinksClient from "./CjRegLinksClient";

export const dynamic = "force-dynamic";

export default async function BackofficeCjRegLinksPage() {
  // 발송 액션이 등급 1 을 요구하므로 화면도 같은 등급으로 막는다.
  await requireAdminPage("/backoffice/registrations/cj-links", 1);

  return <CjRegLinksClient />;
}
