import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import installerImportColumnMap from "@/lib/backoffice/installer-import-column-map.json";
import { normalizePhone } from "@/lib/phone";

export type DataImportKind = "installers";

export type InstallerImportRow = {
  name: string;
  phone: string;
  branch?: string | null;
  region?: string | null;
  coverage?: string | null;
  address?: string | null;
  category?: string | null;
};

export type InstallerImportColumn = keyof InstallerImportRow;

type ImportColumnMap<TColumn extends string> = Partial<Record<TColumn, string | string[]>>;

export type InstallerImportColumnMap = ImportColumnMap<InstallerImportColumn>;

export type ParseResult<T> = {
  total: number;
  rows: T[];
  skipped: number;
};

export function parseInstallerCsv(csvText: string): ParseResult<InstallerImportRow> {
  return parseInstallerRecords(parseCsv(csvText));
}

export function parseInstallerWorkbook(data: ArrayBuffer | Uint8Array): ParseResult<InstallerImportRow> {
  return parseInstallerRecords(parseWorkbook(data));
}

export function parseInstallerRecords(
  records: Record<string, unknown>[],
  columnMap: InstallerImportColumnMap = installerImportColumnMap,
): ParseResult<InstallerImportRow> {
  const rows: InstallerImportRow[] = [];
  let skipped = 0;

  for (const record of records) {
    const name = mappedText(record, columnMap.name);
    const phone = normalizePhone(mappedText(record, columnMap.phone));
    if (!name || !isValidInstallerPhone(phone)) {
      skipped += 1;
      continue;
    }

    const row: InstallerImportRow = {
      name,
      phone,
    };

    assignMappedNullable(row, "branch", record, columnMap.branch);
    assignMappedNullable(row, "region", record, columnMap.region);
    assignMappedNullable(row, "coverage", record, columnMap.coverage);
    assignMappedNullable(row, "address", record, columnMap.address);
    assignMappedNullable(row, "category", record, columnMap.category);

    rows.push(row);
  }

  return { total: records.length, rows, skipped };
}

function parseCsv(csvText: string): Record<string, unknown>[] {
  return parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function parseWorkbook(data: ArrayBuffer | Uint8Array): Record<string, unknown>[] {
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
    defval: "",
    raw: false,
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullable(value: unknown) {
  const valueText = text(value);
  return valueText ? valueText : null;
}

function mappedText(record: Record<string, unknown>, headers: string | string[] | undefined) {
  if (!headers) return "";

  for (const header of Array.isArray(headers) ? headers : [headers]) {
    const valueText = text(record[header]);
    if (valueText) return valueText;
  }
  return "";
}

function assignMappedNullable<T extends object, TColumn extends keyof T>(
  row: T,
  column: TColumn,
  record: Record<string, unknown>,
  headers: string | string[] | undefined,
) {
  if (!headers) return;

  row[column] = nullable(mappedText(record, headers)) as T[TColumn];
}

function isValidInstallerPhone(phone: string) {
  return /^010\d{8}$/.test(phone);
}
