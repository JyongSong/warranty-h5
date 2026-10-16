import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { fetchDispatchRows, assignDispatch } from "@/lib/dispatch";
import { fetchCjDispatchRows } from "@/lib/installation/cj/dispatch-rows";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return errorResponse;

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to") ?? from;
  // channel=cj 면 ERP 대신 CJ 온스타일 접수 건(고객 접수일 기준)을 같은 양식으로 낸다.
  const isCj = sp.get("channel") === "cj";
  if (!from || !to || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) {
    return NextResponse.json({ error: "from / to (YYYYMMDD) required" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }

  try {
    const rows = await (isCj ? fetchCjDispatchRows(from, to) : fetchDispatchRows(from, to));
    const data = assignDispatch(rows);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "ERP 연결 실패";
    console.error("[api/dispatch]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
