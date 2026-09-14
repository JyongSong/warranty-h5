import { formatKrPhone } from "@/lib/phone";
import { formatBackofficeDateTime } from "@/lib/backoffice/table-formatting";
import { AQARA_APP_LABEL, CAPABILITY_LABEL, type InstallerItem } from "./shared";

// 기사 목록 엑셀 내려받기. 화면에 보이는(= 필터가 적용된) 목록만 내보낸다.

const HEADERS = [
  "이름", "전화번호", "소속", "광역", "담당 지역", "지역 메모", "주소",
  "분류", "능력 메모", "설치 가능 항목", "Aqara 앱 연동", "허브 보유",
  "A/S 긴급출동", "기사 명단", "활성",
  "설치 실적", "Happy Call LT", "하자 건수", "불만 사항", "수정일",
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toRow(item: InstallerItem): string[] {
  return [
    item.name ?? "",
    formatKrPhone(item.phone ?? ""),
    item.branch ?? "",
    item.region ?? "",
    // 담당 지역은 배차 기준이라 전부 펼쳐 둔다. 셀 안에서 줄바꿈 대신 쉼표로 잇는다.
    (item.serviceAreas ?? []).join(", "),
    item.coverage ?? "",
    item.address ?? "",
    item.category ?? "",
    item.ability ?? "",
    (item.capabilities ?? []).map((c) => CAPABILITY_LABEL[c] ?? c).join(", "),
    AQARA_APP_LABEL[item.aqaraAppCapability ?? "NONE"] ?? "",
    item.hasAqaraHubInventory ? "보유" : "미보유",
    item.asEmergencyAvailability ?? "",
    item.inCurrentRoster ? "이번 명단" : "명단 밖",
    item.active ? "활성" : "비활성",
    item.installCount == null ? "" : String(item.installCount),
    item.happyCallLt == null ? "" : String(item.happyCallLt),
    item.defectCount == null ? "" : String(item.defectCount),
    item.dissatisfactionNote ?? "",
    item.updatedAt ? formatBackofficeDateTime(item.updatedAt) : "",
  ];
}

export function exportInstallersToExcel(items: InstallerItem[]) {
  const tableRows = [HEADERS, ...items.map(toRow)]
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
  link.download = `installers-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
