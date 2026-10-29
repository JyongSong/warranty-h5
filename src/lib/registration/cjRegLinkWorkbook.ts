import * as XLSX from "xlsx";
import { findInstallerByBranch } from "@/lib/dispatch";
import { normalizePhone } from "@/lib/phone";

/**
 * "기사배정_CJ_..." 엑셀(기사배정 임시 화면에서 내려받은 배정표) → 등록 링크 발송 대상.
 *
 * 쓰는 열은 출고일자 · 주문번호 · 연락처 · 지점명 · 수량 다섯 개뿐이다.
 * 지점명은 dispatch.ts 의 업체 명부에서 연락처를 찾아 기사 연락처 칸에 남긴다.
 * 명부에 없는 업체는 연락처 없이 등록된다.
 */
export type CjRegLinkRow = {
  orderNo: string;
  userPhone: string;
  shipDate: string;
  branchName: string;
  installerPhone: string | null;
  quantity: number;
};

export type CjRegLinkWorkbookResult = {
  rows: CjRegLinkRow[];
  /** 주문번호·연락처·출고일자 중 하나라도 못 읽은 행 */
  skipped: number;
};

export function parseCjRegLinkWorkbook(buffer: Buffer): CjRegLinkWorkbookResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], skipped: 0 };

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  // 같은 주문번호가 여러 줄이면 수량을 더한다. 도어락 2대 주문이면 2대까지 등록된다.
  const byOrder = new Map<string, CjRegLinkRow>();
  let skipped = 0;

  for (const record of records) {
    const orderNo = text(record["주문번호"]).replace(/\D/g, "");
    const userPhone = normalizePhone(text(record["연락처"]));
    const shipDate = toIsoDate(text(record["출고일자"]));
    if (!orderNo || userPhone.length < 9 || !shipDate) {
      skipped += 1;
      continue;
    }

    const quantity = Math.max(1, Number.parseInt(text(record["수량"]), 10) || 1);
    const existing = byOrder.get(orderNo);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    const branchName = text(record["지점명"]);
    const installer = findInstallerByBranch(branchName);
    byOrder.set(orderNo, {
      orderNo,
      userPhone,
      shipDate,
      branchName,
      installerPhone: installer?.phone ? normalizePhone(installer.phone) : null,
      quantity,
    });
  }

  return { rows: [...byOrder.values()], skipped };
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

/** 2026/10/16 · 2026-10-16 · 20261016 → 2026-10-16 */
function toIsoDate(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}
