import { NextResponse } from "next/server";
import { getAttentionAlertSnapshot } from "@/lib/backoffice/attentionAlerts";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { canViewBackoffice } from "@/lib/login/backofficeRoles";

export const dynamic = "force-dynamic";

// 백오피스 화면이 열려 있는 동안 30초마다 호출해서 "처리 필요/예외" 신규 건을 찾는다.
export async function GET() {
  const user = await getCurrentBackofficeUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canViewBackoffice(user.level)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const snapshot = await getAttentionAlertSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
