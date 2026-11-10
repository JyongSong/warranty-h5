import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdminApi } from "@/lib/adminAuth";
import {
  formatYm,
  isValidYm,
  listMonthStatements,
  payBlockReason,
} from "@/lib/installation/settlement/statements";
import { TAX_DOC_TYPE_LABEL } from "@/lib/installer/settlement-info-shared";

export const dynamic = "force-dynamic";

/**
 * 이체용 엑셀: 그 달 정산서 중 지금 지급할 수 있는 건만(지급 전 + 지급 조건 충족).
 * 계좌번호가 들어가므로 수정 권한(edit)이 있는 관리자만 받는다.
 */
export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdminApi("edit");
  if (errorResponse) return errorResponse;

  const ym = new URL(req.url).searchParams.get("ym") ?? "";
  if (!isValidYm(ym)) return NextResponse.json({ error: "YM_INVALID" }, { status: 400 });

  try {
    const statements = await listMonthStatements(ym);
    const rows = statements
      .filter((s) => payBlockReason(s) === null)
      .map((s) => ({
        기사: s.installerName,
        은행: s.bankName ?? "",
        계좌번호: s.accountNumber ?? "(복호화 실패)",
        예금주: s.accountHolder ?? "",
        지급액: s.payAmount,
        "정산 금액": s.baseAmount,
        부가세: s.vatAmount,
        증빙: s.taxDocType ? TAX_DOC_TYPE_LABEL[s.taxDocType] : "",
        "입금 표시": `${formatYm(ym)} 정산`,
      }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows.length ? rows : [{ 안내: "지금 지급할 수 있는 건이 없습니다" }]),
      "이체 목록",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `정산이체_${ym}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("[api/settlement/statements/export]", err);
    return NextResponse.json({ error: "EXPORT_FAILED" }, { status: 500 });
  }
}
