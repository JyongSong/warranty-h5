"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { parseAsHistoryWorkbook } from "@/lib/backoffice/as-history-import";
import { saveAsInstallHistory } from "@/lib/backoffice/as-history-store";
import { initialAsHistoryImportState, type AsHistoryImportState } from "./state";

const PATH = "/backoffice/settings/data-import/as-history";

export async function importAsHistoryAction(
  _prevState: AsHistoryImportState,
  formData: FormData,
): Promise<AsHistoryImportState> {
  const user = await getCurrentBackofficeUser();
  if (!user) return failure("UNAUTHORIZED");
  if (user.level < 1) return failure("FORBIDDEN");

  const file = formData.get("file");
  if (!isFileLike(file) || file.size === 0) return failure("FILE_REQUIRED");
  if (!isExcelFile(file)) return failure("EXCEL_REQUIRED");

  try {
    const parsed = parseAsHistoryWorkbook(Buffer.from(await file.arrayBuffer()));
    if (parsed.rows.length === 0) return failure("NO_ROWS");

    const saved = await saveAsInstallHistory(parsed.rows);
    revalidatePath(PATH);

    return {
      ok: true,
      error: null,
      fileName: file.name,
      total: parsed.total,
      skipped: parsed.skipped,
      ...saved,
    };
  } catch (error) {
    console.error("[backoffice/as-history-import]", error);
    return failure("IMPORT_FAILED");
  }
}

function failure(error: string): AsHistoryImportState {
  return { ...initialAsHistoryImportState, error };
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "size" in value;
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".xls") || name.endsWith(".xlsx");
}
