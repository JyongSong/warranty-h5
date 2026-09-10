export type AsHistoryImportState = {
  ok: boolean;
  error: string | null;
  fileName: string | null;
  total: number;
  skipped: number;
  saved: number;
  inserted: number;
  updated: number;
  matchedInstaller: number;
  matchedVendor: number;
  unmatched: number;
  safeNumber: number;
};

export const initialAsHistoryImportState: AsHistoryImportState = {
  ok: false,
  error: null,
  fileName: null,
  total: 0,
  skipped: 0,
  saved: 0,
  inserted: 0,
  updated: 0,
  matchedInstaller: 0,
  matchedVendor: 0,
  unmatched: 0,
  safeNumber: 0,
};
