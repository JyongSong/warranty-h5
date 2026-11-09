import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdminApi } from "@/lib/adminAuth";
import {
  aggregateSettlementByInstaller,
  listInstallSettlementLinesWithOrder,
  listSettlementLines,
  type InstallSettlementLineView,
  type SettlementLineFilter,
  type SettlementLineView,
} from "@/lib/installation/settlement/service";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = { INSTALL: "설치", AS: "A/S" };

function fmtKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdminApi("view");
  if (errorResponse) return errorResponse;

  const sp = new URL(req.url).searchParams;
  const filter: SettlementLineFilter = {
    periodId: sp.get("periodId") ?? undefined,
    installerId: sp.get("installerId") ?? undefined,
    startDate: sp.get("startDate") ?? undefined,
    endDate: sp.get("endDate") ?? undefined,
    // 기사 정산 화면은 설치 건만 본다(sourceType=INSTALL). 값이 없으면 예전처럼 설치 + A/S.
    sourceType: sp.get("sourceType") === "INSTALL" ? "INSTALL" : undefined,
  };
  const installOnly = filter.sourceType === "INSTALL";

  try {
    const [lines, summary]: [Array<SettlementLineView & Partial<InstallSettlementLineView>>, Awaited<ReturnType<typeof aggregateSettlementByInstaller>>] =
      await Promise.all([
        installOnly ? listInstallSettlementLinesWithOrder(filter) : listSettlementLines(filter),
        aggregateSettlementByInstaller(filter),
      ]);

    // 야간/휴일 할증은 폐지됐다. 폐지 전 건이 섞인 기간에만 열을 남긴다.
    const hasNightWeekend = lines.some((l) => l.nightWeekendFee > 0);

    const detailRows = [...lines]
      .sort((a, b) => a.installerName.localeCompare(b.installerName, "ko") || a.completedAt.localeCompare(b.completedAt))
      .map((l) => ({
      기사: l.installerName,
      구분: (SOURCE_LABEL[l.sourceType] ?? l.sourceType) + (l.agentProxy ? "(대행)" : ""),
      완료일: fmtKstDate(l.completedAt),
      ...(installOnly
        ? { 주문번호: l.erpOrderNo ?? "", 고객: l.customerName ?? "", 주소: l.address ?? "" }
        : {}),
      연동비: l.linkageFee,
      출장비: l.travelFee,
      장거리: l.longDistanceFee,
      ...(hasNightWeekend ? { "야간/주말": l.nightWeekendFee } : {}),
      ...(installOnly ? {} : { 용역비: l.serviceFee }),
      "기타 청구": l.extraClaimFee,
      "월패드(본사 청구)": l.wallpadFee,
      "합계(정산)": l.totalAmount,
      "월패드(현장·참고)": l.wallpadAmount,
      주문ID: l.sourceOrderId,
    }));

    const summaryRows = summary.map((s) => ({
      기사: s.installerName,
      설치건수: s.installCount,
      ...(installOnly ? {} : { "A/S건수": s.asCount }),
      연동비: s.linkageFee,
      출장비: s.travelFee,
      장거리: s.longDistanceFee,
      ...(hasNightWeekend ? { "야간/주말": s.nightWeekendFee } : {}),
      ...(installOnly ? {} : { 용역비: s.serviceFee }),
      "기타 청구": s.extraClaimFee,
      "월패드(본사 청구)": s.wallpadFee,
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
