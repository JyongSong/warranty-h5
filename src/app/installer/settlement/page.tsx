import { redirect } from "next/navigation";

// 정산은 이력 탭에 월 단위로 통합됐다. 앱 히스토리에 남아 있는 예전 경로를
// 위해 리다이렉트만 남긴다.
export default function InstallerSettlementPage() {
  redirect("/installer/history");
}
