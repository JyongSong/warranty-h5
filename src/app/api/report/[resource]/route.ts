import { NextResponse } from "next/server";
import { isReportAuthorized, parseReportQuery, toCsv } from "@/lib/report/query";
import { REPORT_RESOURCES } from "@/lib/report/resources";

// 외부 분석용 읽기 전용 raw data API. 쓰기 메서드는 두지 않는다.
// GET /api/report/{installation-orders|installers|settlement-lines|settlement-statements|warranty-registrations|as-orders}
// 인증: Authorization: Bearer <REPORT_API_KEY>
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  if (!isReportAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { resource } = await params;
  const fetchResource = Object.hasOwn(REPORT_RESOURCES, resource) ? REPORT_RESOURCES[resource] : null;
  if (!fetchResource) {
    return NextResponse.json(
      { error: `Unknown resource. Available: ${Object.keys(REPORT_RESOURCES).join(", ")}` },
      { status: 404 },
    );
  }

  const { query, error } = parseReportQuery(new URL(req.url).searchParams);
  if (error !== null) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    const { rows, total, piiDecryptFailures = 0 } = await fetchResource(query);
    // 고객 개인정보가 담긴 응답이라 언제 무엇을 얼마나 가져갔는지 로그로 남긴다
    console.info("[api/report]", { resource, page: query.page, rows: rows.length, total });
    if (piiDecryptFailures > 0) {
      // 키가 데이터와 맞지 않으면 고객 칸이 조용히 비므로 눈에 띄게 남긴다
      console.warn("[api/report] PII 복호화 실패", { resource, piiDecryptFailures });
    }
    const headers = {
      "Cache-Control": "no-store",
      "X-Total-Count": String(total),
      "X-Pii-Decrypt-Failures": String(piiDecryptFailures),
    };

    if (query.format === "csv") {
      return new NextResponse(toCsv(rows), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${resource}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { resource, total, page: query.page, page_size: query.pageSize, data: rows },
      { headers },
    );
  } catch (e) {
    console.error(`[api/report/${resource}]`, e);
    return NextResponse.json({ error: "데이터 조회에 실패했습니다." }, { status: 500 });
  }
}
