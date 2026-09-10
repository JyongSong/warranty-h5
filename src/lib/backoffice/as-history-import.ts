import * as XLSX from "xlsx";
import { isKoreanMobileNumber, isSafeVirtualNumber, normalizePhone } from "@/lib/phone";

/**
 * ECOUNT "A/S수리조회" 내려받기 → A/S 과거 설치 이력.
 *
 * 원장이 지저분하다는 전제로 짠다. 실측(2026년 4,180행):
 *  - 담당기사 37.5%만 채워져 있다 → 매칭 목표는 기사가 아니라 시공 "업체"(거래처명, 100%)
 *  - 연락처 42.6%가 050X 안심번호 → 전화로는 영영 못 찾는다. 주소/이름으로만 찾힌다
 *  - 설치일자 표기가 4종(260903 / 20260903 / 2026-09-03 / 26.09.03)
 */
export type AsHistoryImportRow = {
  erpDocNo: string;
  installDate: string | null;
  customerName: string | null;
  customerPhone: string | null;
  phoneKind: "MOBILE" | "SAFE" | "OTHER";
  address: string | null;
  addressKey: string | null;
  itemName: string | null;
  vendorName: string | null;
  installerNameRaw: string | null;
  serviceFee: number | null;
  erpStatus: string | null;
  memo: string | null;
};

export type AsHistoryParseResult = {
  total: number;
  rows: AsHistoryImportRow[];
  skipped: number;
};

const COLUMNS = {
  erpDocNo: ["일자-No.", "일자-No", "전표번호"],
  installDate: ["설치일자", "설치일"],
  customerName: ["고객명", "거래처담당자"],
  customerPhone: ["연락처", "전화번호"],
  address: ["주소"],
  itemName: ["품목명"],
  vendorName: ["거래처명"],
  installerNameRaw: ["담당기사", "담당자"],
  serviceFee: ["용역비"],
  erpStatus: ["진행상태"],
  memo: ["거래처 메모 및 적요", "적요"],
} satisfies Record<keyof AsHistoryImportRow | string, string[]>;

/** 이 두 컬럼이 같이 있는 줄을 헤더로 본다. ECOUNT 는 0행에 회사명 배너를 넣는다. */
const HEADER_MARKERS = ["고객명", "거래처명"];

export function parseAsHistoryWorkbook(data: ArrayBuffer | Uint8Array): AsHistoryParseResult {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { total: 0, rows: [], skipped: 0 };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });

  const headerIndex = matrix.findIndex((row) => {
    const cells = row.map((c) => text(c));
    return HEADER_MARKERS.every((marker) => cells.includes(marker));
  });
  if (headerIndex < 0) return { total: 0, rows: [], skipped: 0 };

  const header = matrix[headerIndex].map((c) => text(c));
  const records = matrix.slice(headerIndex + 1).map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""])),
  );

  return parseAsHistoryRecords(records);
}

export function parseAsHistoryRecords(records: Record<string, unknown>[]): AsHistoryParseResult {
  const rows: AsHistoryImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const record of records) {
    const erpDocNo = normalizeErpDocNo(pick(record, COLUMNS.erpDocNo));
    // 전표번호가 upsert 키다. 없으면 재업로드 때 중복만 쌓이므로 버린다.
    // 같은 파일 안의 중복도 마지막 한 줄만 남긴다(뒤엣것이 최신 수정본).
    if (!erpDocNo) {
      skipped += 1;
      continue;
    }
    if (seen.has(erpDocNo)) {
      const previous = rows.findIndex((r) => r.erpDocNo === erpDocNo);
      if (previous >= 0) rows.splice(previous, 1);
    }
    seen.add(erpDocNo);

    const rawPhone = pick(record, COLUMNS.customerPhone);
    const phone = firstPhone(rawPhone);
    const address = pick(record, COLUMNS.address) || null;

    rows.push({
      erpDocNo,
      installDate: normalizeInstallDate(pick(record, COLUMNS.installDate)),
      customerName: pick(record, COLUMNS.customerName) || null,
      customerPhone: phone || null,
      phoneKind: classifyPhone(phone),
      address,
      addressKey: address ? normalizeAddressKey(address) : null,
      itemName: pick(record, COLUMNS.itemName) || null,
      vendorName: pick(record, COLUMNS.vendorName) || null,
      installerNameRaw: pick(record, COLUMNS.installerNameRaw) || null,
      serviceFee: normalizeServiceFee(pick(record, COLUMNS.serviceFee)),
      erpStatus: pick(record, COLUMNS.erpStatus) || null,
      memo: pick(record, COLUMNS.memo) || null,
    });
  }

  return { total: records.length, rows, skipped };
}

/** "26/09/04 -7" → "26/09/04-7". 사람이 넣은 공백만 걷어낸다. */
export function normalizeErpDocNo(value: string): string {
  return value.replace(/\s+/g, "");
}

/** ERP 표기 4종 + 꼬리 잡소리("2026-09-03 (9월정산)")를 YYYY-MM-DD 로 모은다. */
export function normalizeInstallDate(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  let year: number;
  let month: string;
  let day: string;

  if (digits.length >= 8) {
    year = Number(digits.slice(0, 4));
    month = digits.slice(4, 6);
    day = digits.slice(6, 8);
  } else if (digits.length === 6) {
    // ERP 는 2000년대만 쓴다. "260903" → 2026-09-03
    year = 2000 + Number(digits.slice(0, 2));
    month = digits.slice(2, 4);
    day = digits.slice(4, 6);
  } else {
    return null;
  }

  const m = Number(month);
  const d = Number(day);
  if (year < 2000 || year > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${month}-${day}`;
}

export function normalizeServiceFee(value: string): number | null {
  const digits = value.replace(/[^\d-]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * 한 칸에 번호가 여러 개 들어간 행이 있다("010-1111-2222 / 0503-...").
 * 기사가 실제로 걸 수 있는 번호를 우선하고, 없으면 첫 번호를 쓴다.
 */
export function firstPhone(value: string): string {
  const candidates = value.split(/[/,]|\(|\)/).map((part) => normalizePhone(part)).filter(Boolean);
  return candidates.find((c) => isKoreanMobileNumber(c)) ?? candidates[0] ?? "";
}

export function classifyPhone(phone: string): "MOBILE" | "SAFE" | "OTHER" {
  if (isKoreanMobileNumber(phone)) return "MOBILE";
  if (isSafeVirtualNumber(phone)) return "SAFE";
  return "OTHER";
}

/**
 * 주소 조회 키. ERP 는 "서울특별시"와 "서울"을 섞어 쓰고 공백도 제멋대로라
 * 원문끼리는 절대 안 맞는다. 시도 별칭을 짧은 쪽으로 모으고 구분자를 지운다.
 * 동/호수까지 포함하므로 같은 세대만 맞는다 — A/S 는 그 정도 정밀도가 맞다.
 */
const SIDO_ALIASES: [RegExp, string][] = [
  [/^서울특별시/, "서울"],
  [/^부산광역시/, "부산"],
  [/^대구광역시/, "대구"],
  [/^인천광역시/, "인천"],
  [/^광주광역시/, "광주"],
  [/^대전광역시/, "대전"],
  [/^울산광역시/, "울산"],
  [/^세종특별자치시/, "세종"],
  [/^경기도/, "경기"],
  [/^강원(특별자치)?도/, "강원"],
  [/^충청북도/, "충북"],
  [/^충청남도/, "충남"],
  [/^전(라)?북(특별자치)?도/, "전북"],
  [/^전라남도/, "전남"],
  [/^경상북도/, "경북"],
  [/^경상남도/, "경남"],
  [/^제주(특별자치)?도/, "제주"],
];

export function normalizeAddressKey(address: string): string | null {
  let value = address.trim().replace(/\s+/g, " ");
  if (!value) return null;

  for (const [pattern, replacement] of SIDO_ALIASES) {
    if (pattern.test(value)) {
      value = value.replace(pattern, replacement);
      break;
    }
  }

  const key = value
    .replace(/[\s\-.,()]/g, "")
    .replace(/(번지|호실)/g, "")
    .toLowerCase();
  return key || null;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function pick(record: Record<string, unknown>, headers: string[]) {
  for (const header of headers) {
    const value = text(record[header]);
    if (value) return value;
  }
  return "";
}
