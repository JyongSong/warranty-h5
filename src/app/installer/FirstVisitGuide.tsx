"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { hasSeenInstallerGuide } from "./guideSeen";

/**
 * 처음 앱을 연 기사에게 사용 안내를 한 번 띄운다.
 *
 * localStorage 는 서버에서 읽을 수 없어 판단이 클라이언트에서만 가능하다.
 * 그래서 안내를 오버레이로 겹치지 않고 전용 화면으로 보낸다 — 안내를 다시
 * 보는 경로(내 정보)와 같은 화면을 쓰게 되어 구현이 하나로 줄어든다.
 */
export default function FirstVisitGuide() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    // 로그인 전이거나 이미 안내 화면이면 손대지 않는다.
    if (pathname.startsWith("/installer/login")) return;
    if (pathname.startsWith("/installer/guide")) return;
    if (hasSeenInstallerGuide()) return;

    router.replace("/installer/guide?first=1");
  }, [pathname, router]);

  return null;
}
