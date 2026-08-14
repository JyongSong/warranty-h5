import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdminApi } from "@/lib/adminAuth";
import {
  aggregateSettlementByInstaller,
  listSettlementLines,
  type SettlementLineFilter,
} from "@/lib/installation/settlement/service";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = { INSTALL: "설치", AS: "A/S" };

function fmtKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return errorResponse;

  const sp = new URL(req.url).searchParams;
  const filter: SettlementLineFilter = {
    periodId: sp.get("periodId") ?? undefined,
    installerId: sp.get("installerId") ?? undefined,
    startDate: sp.get("startDate") ?? undefined,
    endDate: sp.get("endDate") ?? undefined,
  };

  try {
    const [lines, summary] = await Promise.all([
      listSettlementLines(filter),
      aggregateSettlementByInstaller(filter),
    ]);

    const detailRows = lines.map((l) => ({
      기사: l.installerName,
      구분: SOURCE_LABEL[l.sourceType] ?? l.sourceType,
      완료일: fmtKstDate(l.completedAt),
      연동비: l.linkageFee,
      출장비: l.travelFee,
      장거리: l.longDistanceFee,
      "야간/주말": l.nightWeekendFee,
      용역비: l.serviceFee,
      "합계(정산)": l.totalAmount,
      "월패드(현장·참고)": l.wallpadAmount,
      주문ID: l.sourceOrderId,
    }));

    const summaryRows = summary.map((s) => ({
      기사: s.installerName,
      설치건수: s.installCount,
      "A/S건수": s.asCount,
      연동비: s.linkageFee,
      출장비: s.travelFee,
      장거리: s.longDistanceFee,
      "야간/주말": s.nightWeekendFee,
      용역비: s.serviceFee,
      합계: s.totalAmount,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ 안내: "데이터 없음" }]),
      "기사별 합계",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(detailRows.length ? detailRows : [{ 안내: "데이터 없음" }]),
      "상세 내역",
    );

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const stamp = filter.periodId && filter.periodId !== "__none__"
      ? filter.periodId.slice(0, 8)
      : `${filter.startDate ?? "all"}_${filter.endDate ?? "all"}`;
    const filename = `기사정산_${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Excel 생성 실패";
    console.error("[api/settlement/export]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
