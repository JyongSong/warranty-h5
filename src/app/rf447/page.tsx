import type { Metadata } from "next";
import { getPublicWallpadCompatData } from "@/lib/installation/wallpad/service";
import Rf447SearchClient from "./Rf447SearchClient";

// RF447 월패드 사전 호환 조회. 로그인 없이 누구나 링크로 들어와 찾아본다(읽기 전용).
// 입력·수정은 백오피스 "월패드 호환 (RF447)" 에서 한다. 내부 정보는 getPublicWallpadCompatData 가 뺀다.
// 백오피스에서 고친 내용이 바로 보이게 매번 읽는다(빌드 때 DB 를 읽지 않게 하는 이유도 있다).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RF447 월패드 사전 호환 조회 | Aqara",
  description: "월패드 모델명 또는 아파트명으로 아카라 도어락 RF447 연동 사례를 찾아봅니다.",
  robots: { index: false, follow: false },
};

export default async function Rf447Page() {
  const data = await getPublicWallpadCompatData();
  return <Rf447SearchClient {...data} />;
}
