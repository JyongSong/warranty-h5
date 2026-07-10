"use server";

import { revalidatePath } from "next/cache";
import {
  parseInstallerCsv,
  parseInstallerWorkbook,
  type DataImportKind,
  type InstallerImportRow,
} from "@/lib/backoffice/data-import";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { initialDataImportActionState, type DataImportActionState } from "./state";

const DATA_IMPORT_PATH = "/backoffice/settings/data-import";

export async function importBackofficeDataAction(
  _prevState: DataImportActionState,
  formData: FormData,
): Promise<DataImportActionState> {
  const auth = await requireImporter();
  if (!auth.ok) {
    return failure(auth.error);
  }

  const kind = formData.get("kind");
  if (kind !== "installers") {
    return failure("IMPORT_KIND_REQUIRED");
  }

  const file = formData.get("file");
  if (!isFileLike(file) || file.size === 0) {
    return failure("CSV_FILE_REQUIRED", kind);
  }

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const isWorkbook = isExcelFile(file);

    const result = isWorkbook
      ? parseInstallerWorkbook(fileBuffer)
      : parseInstallerCsv(fileBuffer.toString("utf8"));
    const imported = await saveInstallers(result.rows);
    revalidatePath(DATA_IMPORT_PATH);
    return success(kind, result.total, imported, toInstallerPreview(result.rows), result.skipped);
  } catch (error) {
    console.error("[backoffice/data-import]", error);
    return failure("CSV_IMPORT_FAILED", kind);
  }
}

async function requireImporter(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentBackofficeUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED" };
  if (user.level < 1) return { ok: false, error: "FORBIDDEN" };
  return { ok: true };
}

async function saveInstallers(rows: InstallerImportRow[]) {
  if (rows.length === 0) return 0;

  const { prisma } = await import("@/lib/prisma");
  const uniqueRows = uniqueInstallersByPhone(rows);
  for (const row of uniqueRows) {
    await prisma.installer.upsert({
      where: { phone: row.phone },
      create: row,
      update: {
        name: row.name,
        branch: row.branch ?? null,
        region: row.region ?? null,
        coverage: row.coverage ?? null,
        address: row.address ?? null,
        category: row.category ?? null,
      },
    });
  }
  return uniqueRows.length;
}

function success(
  kind: DataImportKind,
  total: number,
  imported: number,
  preview: Record<string, string | number | boolean | null>[],
  skipped: number,
): DataImportActionState {
  const duplicates = Math.max(total - skipped - imported, 0);
  const failed = skipped;

  return {
    ok: true,
    message: `전체 ${total}개, 저장 ${imported}개, 중복 ${duplicates}개, 제외 ${failed}개`,
    error: null,
    kind,
    total,
    imported,
    duplicates,
    failed,
    skipped,
    preview,
  };
}

function failure(error: string, kind: DataImportKind | null = null): DataImportActionState {
  return {
    ...initialDataImportActionState,
    kind,
    error,
  };
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "size" in value;
}

function isExcelFile(file: File) {
  const name = "name" in file ? file.name.toLowerCase() : "";
  const type = "type" in file ? file.type : "";

  return (
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function toInstallerPreview(rows: InstallerImportRow[]) {
  return uniqueInstallersByPhone(rows).slice(0, 20).map((row) => ({
    name: row.name,
    phone: row.phone,
    branch: row.branch ?? null,
    region: row.region ?? null,
    coverage: row.coverage ?? null,
    address: row.address ?? null,
    category: row.category ?? null,
  }));
}

function uniqueInstallersByPhone(rows: InstallerImportRow[]) {
  const byPhone = new Map<string, InstallerImportRow>();
  for (const row of rows) {
    byPhone.set(row.phone, row);
  }
  return Array.from(byPhone.values());
}
