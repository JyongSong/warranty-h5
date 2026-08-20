import type { ReactNode } from "react";
import InstallerNav from "./InstallerNav";
import PushRegister from "./PushRegister";

// 기사 앱 공통 셸. 하단 탭과 푸시 등록을 모든 화면에 둔다.
// PushRegister 는 Capacitor 쉘 밖에서는 no-op 이라 브라우저에는 영향이 없고,
// 어느 화면에서 앱을 열어도 기기 토큰이 등록되도록 여기에 둔다.
export default function InstallerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PushRegister />
      {children}
      <InstallerNav />
    </>
  );
}
