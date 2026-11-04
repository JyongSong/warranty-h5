import { requireAdminPage } from "@/lib/adminAuth";
import { getWallpadCompatData } from "@/lib/installation/wallpad/service";
import WallpadCompatClient from "./WallpadCompatClient";

export const dynamic = "force-dynamic";

export default async function BackofficeWallpadCompatPage() {
  // 입력·수정 액션이 등급 1 을 요구하므로 화면도 같은 등급으로 막는다.
  await requireAdminPage("/backoffice/wallpad-compat");
  const data = await getWallpadCompatData();

  return <WallpadCompatClient {...data} />;
}
