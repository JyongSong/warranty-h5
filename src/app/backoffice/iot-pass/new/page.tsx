import { canEditBackoffice } from "@/lib/login/backofficeRoles";
import Link from "next/link";
import { requireAdminPage } from "@/lib/adminAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import IotPassForm from "../IotPassForm";

export default async function BackofficeIotPassCreatePage() {
  // 생성 API(POST /api/iot-pass)가 등급 1 을 요구한다.
  const admin = await requireAdminPage("/backoffice/iot-pass/new", "edit");

  return (
    <div>
      <BackofficePageHeader
        title="IoT Pass 추가"
        leading={
          <Link href="/backoffice/iot-pass" className={getBackofficeButtonClass("secondary", "sm")}>
            ← 목록
          </Link>
        }
      />
      <IotPassForm item={null} canManage={canEditBackoffice(admin.level)} />
    </div>
  );
}
