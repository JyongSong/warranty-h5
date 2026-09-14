import { requireAdminPage } from "@/lib/adminAuth";
import IotPassClient from "./IotPassClient";

export default async function BackofficeIotPassPage() {
  // 목록 API(GET /api/iot-pass)가 등급 1 을 요구한다. 여기서 막지 않으면
  // 등급 0 계정에게는 빈 화면에 권한 오류만 뜬다.
  const admin = await requireAdminPage("/backoffice/iot-pass", 1);

  return <IotPassClient admin={admin} />;
}
