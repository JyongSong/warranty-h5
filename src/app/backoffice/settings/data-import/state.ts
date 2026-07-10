import type { DataImportKind } from "@/lib/backoffice/data-import";

export type DataImportActionState = {
  ok: boolean;
  message: string | null;
  error: string | null;
  kind: DataImportKind | null;
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  skipped: number;
  preview: Record<string, string | number | boolean | null>[];
};

export const initialDataImportActionState: DataImportActionState = {
  ok: false,
  message: null,
  error: null,
  kind: null,
  total: 0,
  imported: 0,
  duplicates: 0,
  failed: 0,
  skipped: 0,
  preview: [],
};
