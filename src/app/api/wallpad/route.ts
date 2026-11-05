import { hasWallpadApiKey, json, preflight } from "@/lib/installation/wallpad/api";
import { getPublicWallpadCompatData, getWallpadCompatData } from "@/lib/installation/wallpad/service";

// GET /api/wallpad — 월패드 모델·단지 현장 사례·제조사/시공사 의견 전체.
// 키 없이: 공개 조회 페이지(/rf447)와 같은 가린 데이터. 키를 붙이면 주소·주문 연결·메모까지.
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  try {
    const full = hasWallpadApiKey(req);
    const data = full ? await getWallpadCompatData() : await getPublicWallpadCompatData();
    return json(req, { scope: full ? "full" : "public", ...data });
  } catch (error) {
    console.error("[api/wallpad]", error);
    return json(req, { error: "LOAD_FAILED" }, 500);
  }
}
