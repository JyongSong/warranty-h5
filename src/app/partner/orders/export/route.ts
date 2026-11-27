import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthPartner } from "@/lib/partnerAuth";
import { getInstallationPartnerByCode } from "@/lib/installation/partner/service";
import {
  getPartnerCompletedSummary,
  normalizePartnerCompletedRange,
  toKstYmd,
} from "@/lib/installation/partner/views";
import { formatPartnerPhone } from "../format";

export const dynamic = "force-dynamic";

const HEADER = ["완료일", "주문번호", "고객명", "연락처", "설치 주소", "설치 품목", "담당 기사", "청구 금액"];

// PL 완료 탭을 화면과 같은 기간·같은 내역(본사 검수 완료 건)으로 엑셀로 내려준다.
export async function GET(req: NextRequest) {
  const account = await getAuthPartner();
  if (!account || account.partnerCode !== "PL") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const partner = await getInstallationPartnerByCode(account.partnerCode);
  if (!partner) {
    return NextResponse.json({ error: "partner not found" }, { status: 404 });
  }

  const sp = new URL(req.url).searchParams;
  const range = normalizePartnerCompletedRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);

  try {
    const summary = await getPartnerCompletedSummary(partner.id, range);

    const rows: (string | number)[][] = summary.orders.map((order) => [
      order.completedAt ? toKstYmd(order.completedAt) : "",
      order.orderNumber ?? "",
      order.customerName ?? "",
      order.customerPhone ? formatPartnerPhone(order.customerPhone) : "",
      order.address ?? "",
      order.installItems
        .map((item) => `${item.name} ×${item.quantity}${item.onsitePayment ? " (현장결제)" : ""}`)
        .join(", "),
      order.installer ?? "",
      order.claimAmount ?? "",
    ]);
    rows.push(["합계", "", "", "", "", "", `${summary.orders.length}건`, summary.totalAmount]);

    const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 24 },
      { wch: 10 },
      { wch: 15 },
      { wch: 40 },
      { wch: 36 },
      { wch: 10 },
      { wch: 12 },
    ];
    // 청구 금액은 숫자 셀로 두고 천 단위 구분만 붙인다(엑셀에서 바로 합계 가능).
    for (let r = 1; r <= rows.length; r += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 7 })];
      if (cell && cell.t === "n") cell.z = "#,##0";
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "완료");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `${partner.name}_완료_${range.from.replace(/-/g, "")}-${range.to.replace(/-/g, "")}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[partner/orders/export]", error);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
