import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { fetchDispatchRows, assignDispatch } from "@/lib/dispatch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return errorResponse;

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to") ?? from;
  if (!from || !to || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) {
    return NextResponse.json({ error: "from / to (YYYYMMDD) required" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }

  try {
    const rows = await fetchDispatchRows(from, to);
    const data = assignDispatch(rows);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "ERP 연결 실패";
    console.error("[api/dispatch]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
