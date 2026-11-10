import type { ReactNode } from "react";
import { getCurrentInstaller } from "@/lib/installer/session";
import { getInstallerTabCounts } from "@/lib/installer/tabCounts";
import FirstVisitGuide from "./FirstVisitGuide";
import InstallerNav from "./InstallerNav";
import NoticePopup from "./NoticePopup";
import PushRegister from "./PushRegister";
import StatementGate from "./StatementGate";
import { getBlockingStatement, isSettlementLaunched } from "@/lib/installation/settlement/statements";

// 기사 앱 공통 셸. 하단 탭과 푸시 등록을 모든 화면에 둔다.
// PushRegister 는 Capacitor 쉘 밖에서는 no-op 이라 브라우저에는 영향이 없고,
// 어느 화면에서 앱을 열어도 기기 토큰이 등록되도록 여기에 둔다.
export default async function InstallerLayout({ children }: { children: ReactNode }) {
  // 로그인 전에는 세션이 없다. 배지 때문에 로그인 화면이 깨지면 안 되므로
  // 조회 실패는 0 으로 떨어뜨린다.
  const installer = await getCurrentInstaller();
  const counts = installer
    ? await getInstallerTabCounts(installer.id).catch(() => ({ install: 0, as: 0 }))
    : { install: 0, as: 0 };
  // 조회가 실패해도 앱 전체가 막히면 안 되므로 "막지 않음" 으로 떨어뜨린다.
  // 정산 기능 공개 전에는 막지 않는다.
  const blocking =
    installer && (await isSettlementLaunched().catch(() => false))
      ? await getBlockingStatement(installer.id).catch(() => null)
      : null;

  return (
    <>
      <PushRegister />
      <FirstVisitGuide />
      <NoticePopup loggedIn={Boolean(installer)} />
      <StatementGate blockedYm={blocking?.ym ?? null}>{children}</StatementGate>
      <InstallerNav counts={counts} />
    </>
  );
}
