import type { Metadata } from "next";
import CjRequestClient from "./CjRequestClient";
import privacyPolicy from "./privacy-policy.json";

// CJ 채널 공개 페이지. 1:1 토큰 링크가 아니라 모든 고객이 같은 URL 로 들어온다.
// 신원 확인은 (1) CJ 가 올린 명단에 있는 주문번호 (2) 주문자 번호 SMS 인증
// 두 가지로 한다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "설치 정보 등록 | Aqara × CJ Onstyle",
  description: "도어락 설치를 위한 예약 정보를 등록해 주세요.",
  robots: { index: false, follow: false },
};

export default function CjInstallationRequestPage() {
  return <CjRequestClient initialToday={todayKST()} privacyPolicy={privacyPolicy} />;
}

function todayKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}
