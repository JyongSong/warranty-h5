import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";
import { requireAdminApi } from "@/lib/adminAuth";
import {
  fetchDispatchRows,
  assignDispatch,
  formatDueDate,
  DISPATCH_CONST,
} from "@/lib/dispatch";

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
    const rows = assignDispatch(await fetchDispatchRows(from, to));

    const templatePath = path.join(process.cwd(), "public/templates/dispatch-template.xlsx");
    const templateBuf = await fs.readFile(templatePath);
    const wb = XLSX.read(templateBuf, { type: "buffer", cellStyles: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    rows.forEach((row, i) => {
      const r = i + 2;
      const set = (col: string, val: string | number | null) => {
        if (val === null || val === undefined || val === "") return;
        ws[`${col}${r}`] = { t: typeof val === "number" ? "n" : "s", v: val };
      };
      const shipDate = row.due_date ? formatDueDate(row.due_date) : formatDueDate(from);
      set("A", shipDate);
      set("B", String(i + 1).padStart(3, "0"));
      set("C", row.business_number);
      set("D", row.branch_name);
      set("E", DISPATCH_CONST.창고);
      set("F", DISPATCH_CONST.담당자);
      set("G", DISPATCH_CONST.수리유형);
      set("H", row.customer_name);
      set("I", row.phone);
      set("J", row.order_numbers || row.no_girl);
      set("K", row.address);
      set("L", DISPATCH_CONST.설치완료여부);
      set("P", row.memo);
      set("Q", row.item_code);
      set("R", row.item_name);
      set("S", row.quantity);
      if (!row.order_numbers || row.order_numbers.trim() === "") {
        set("U", "비매출");
      }
    });

    const lastRow = Math.max(rows.length + 1, 2);
    ws["!ref"] = `A1:V${lastRow}`;

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const filename =
      from === to ? `기사배정_${from}.xlsx` : `기사배정_${from}-${to}.xlsx`;

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
    console.error("[api/dispatch/export]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
