import crypto from "node:crypto";

// 외부 분석용 읽기 전용 리포트 API (/api/report/*) 공용 로직.
// 고객 이름·전화·주소를 복호화해서 내보내므로 반드시 isReportAuthorized() 통과 후에만 데이터를 읽는다.

export const MAX_PAGE_SIZE = 1000;

export type ReportRow = Record<string, unknown>;

export type ReportQuery = {
  from: Date | null; // KST 그날 00:00
  to: Date | null; // KST 그날 23:59:59.999
  page: number;
  pageSize: number;
  format: "json" | "csv";
};

/** Authorization: Bearer <REPORT_API_KEY>. 키가 설정돼 있지 않으면 항상 거부한다. */
export function isReportAuthorized(header: string | null): boolean {
  const key = process.env.REPORT_API_KEY?.trim();
  if (!key || !header) return false;
  const digest = (v: string) => crypto.createHash("sha256").update(v).digest();
  return crypto.timingSafeEqual(digest(header.trim()), digest(`Bearer ${key}`));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function kstDate(value: string, endOfDay: boolean): Date | null {
  if (!DATE_RE.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+09:00`);
  // 2026-02-31 같은 날짜는 Date 가 다음 달로 넘기므로 왕복해서 걸러 낸다
  const roundTrip = new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  return roundTrip === value ? date : null;
}

export function parseReportQuery(
  params: URLSearchParams,
): { query: ReportQuery; error: null } | { query: null; error: string } {
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const from = fromRaw ? kstDate(fromRaw, false) : null;
  const to = toRaw ? kstDate(toRaw, true) : null;
  if (fromRaw && !from) return { query: null, error: "from must be YYYY-MM-DD" };
  if (toRaw && !to) return { query: null, error: "to must be YYYY-MM-DD" };

  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("page_size") ?? MAX_PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1) {
    return { query: null, error: "page must be an integer >= 1" };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return { query: null, error: `page_size must be an integer between 1 and ${MAX_PAGE_SIZE}` };
  }

  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    return { query: null, error: "format must be json or csv" };
  }

  return { query: { from, to, page, pageSize, format }, error: null };
}

/** Prisma where 절에 쓰는 기간 조건. 기간이 없으면 undefined. */
export function dateRange(q: ReportQuery): { gte?: Date; lte?: Date } | undefined {
  if (!q.from && !q.to) return undefined;
  return { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
}

export function pageArgs(q: ReportQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Excel 에서 한글이 깨지지 않도록 BOM 을 붙인 CSV. */
export function toCsv(rows: ReportRow[]): string {
  const bom = "﻿";
  if (rows.length === 0) return bom;
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  return bom + lines.join("\r\n") + "\r\n";
}
