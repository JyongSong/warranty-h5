import { formatKrPhone } from "@/lib/phone";

// 세미나 신청 명단 엑셀 내려받기. 취소한 사람도 상태를 달아 함께 내보낸다.

export type SeminarRegistrationRow = {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  registeredAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
};

const HEADERS = ["순번", "이름", "전화번호", "소속", "지역", "신청 시각", "상태", "취소 시각"];

export function seminarRegistrationStatusLabel(row: SeminarRegistrationRow) {
  if (!row.cancelledAt) return "신청";
  return row.cancelledBy === "ADMIN" ? "관리자 취소" : "본인 취소";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function exportSeminarRegistrationsToExcel(title: string, rows: SeminarRegistrationRow[]) {
  let order = 0;
  const body = rows.map((row) => [
    row.cancelledAt ? "" : String((order += 1)),
    row.name,
    formatKrPhone(row.phone),
    row.branch ?? "",
    row.region ?? "",
    row.registeredAt,
    seminarRegistrationStatusLabel(row),
    row.cancelledAt ?? "",
  ]);

  const tableRows = [HEADERS, ...body]
    .map((cols) => `<tr>${cols.map((col) => `<td>${escapeHtml(col)}</td>`).join("")}</tr>`)
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8" /></head>
      <body><table>${tableRows}</table></body>
    </html>
  `;

  const blob = new Blob(["﻿", html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title}-신청명단-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
