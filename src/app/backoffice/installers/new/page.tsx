import Link from "next/link";
import { requireAdminPage } from "@/lib/adminAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import InstallerForm from "../InstallerForm";

export default async function BackofficeInstallerCreatePage() {
  // 생성 API(POST /api/installers)가 등급 1 을 요구한다.
  const admin = await requireAdminPage("/backoffice/installers/new", 1);

  return (
    <div>
      <BackofficePageHeader
        title="기사 추가"
        leading={
          <Link href="/backoffice/installers" className={getBackofficeButtonClass("secondary", "sm")}>
            ← 목록
          </Link>
        }
      />
      <InstallerForm item={null} canManage={admin.level >= 1} />
    </div>
  );
}
