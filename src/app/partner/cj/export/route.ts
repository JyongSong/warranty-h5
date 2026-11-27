import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthPartner } from "@/lib/partnerAuth";
import { listCjManifestEntriesForExport } from "@/lib/installation/cj/manifest";
import type { CjManifestDateField, CjManifestStatusFilter } from "@/lib/installation/cj/manifest";

export const dynamic = "force-dynamic";

const DATE_FIELDS: CjManifestDateField[] = ["orderDate", "createdAt", "consumedAt"];
const STATUSES: CjManifestStatusFilter[] = ["ALL", "PENDING", "CONSUMED"];
const STATUS_LABEL: Record<CjManifestStatusFilter, string> = {
  ALL: "전체",
  PENDING: "미접수",
  CONSUMED: "접수완료",
};

// 한국 시간 "YYYY-MM-DD HH:mm".
function formatKst(value: Date | null) {
  if (!value) return "";
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

// CJ 주문번호 조회 결과를 화면과 같은 조건으로 엑셀로 내려준다.
export async function GET(req: NextRequest) {
  const partner = await getAuthPartner();
  if (!partner || partner.partnerCode !== "CJ") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const dateFieldParam = sp.get("dateField") as CjManifestDateField | null;
  const statusParam = sp.get("status") as CjManifestStatusFilter | null;
  const dateField = dateFieldParam && DATE_FIELDS.includes(dateFieldParam) ? dateFieldParam : "orderDate";
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : "ALL";
  const dateFrom = sp.get("dateFrom") || null;
  const dateTo = sp.get("dateTo") || null;

  try {
    const { entries, truncated } = await listCjManifestEntriesForExport({
      query: sp.get("query") ?? "",
      dateField,
      dateFrom,
      dateTo,
      status,
    });

    const rows = entries.map((entry) => ({
      주문번호: entry.orderNo,
      주문일: entry.orderDate ?? "",
      등록일시: formatKst(entry.createdAt),
      상태: entry.consumedAt ? "접수 완료" : "미접수",
      접수일시: formatKst(entry.consumedAt),
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ["주문번호", "주문일", "등록일시", "상태", "접수일시"],
    });
    // 주문번호가 지수 표기로 바뀌지 않도록 문자열 셀로 둔다(json_to_sheet 가 string 은 "s" 로 쓴다).
    ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "주문번호");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const today = formatKst(new Date()).slice(0, 10).replace(/-/g, "");
    const range = dateFrom || dateTo ? `_${(dateFrom ?? "").replace(/-/g, "")}-${(dateTo ?? "").replace(/-/g, "")}` : "";
    const filename = `CJ_주문번호_${STATUS_LABEL[status]}${range}_${today}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        ...(truncated ? { "X-Export-Truncated": "1" } : {}),
      },
    });
  } catch (error) {
    console.error("[partner/cj/export]", error);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
