"use client";

import { useActionState, useState } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { importBackofficeDataAction } from "./actions";
import { initialDataImportActionState } from "./state";
import {
  parseInstallerCsv,
  parseInstallerWorkbook,
  type DataImportKind,
  type InstallerImportRow,
} from "@/lib/backoffice/data-import";
import type { JsonEntityDisplay, JsonEntityKeyValueRow } from "@/lib/backoffice/json-entities";

const errorMessage: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "관리자 권한이 필요합니다.",
  IMPORT_KIND_REQUIRED: "가져올 데이터 종류를 선택해 주세요.",
  CSV_FILE_REQUIRED: "CSV/엑셀 파일을 선택해 주세요.",
  CSV_IMPORT_FAILED: "CSV/엑셀 저장에 실패했습니다. 파일 컬럼과 데이터를 확인해 주세요.",
};

const installerColumns = [
  { key: "name", label: "name" },
  { key: "phone", label: "phone" },
  { key: "branch", label: "branch" },
  { key: "region", label: "region" },
  { key: "coverage", label: "coverage" },
  { key: "address", label: "address" },
  { key: "category", label: "category" },
];

type PreviewRow = Record<string, string | number | boolean | null>;

type FilePreview = {
  total: number;
  skipped: number;
  rows: PreviewRow[];
};

type DataImportColumnMapEntity = {
  label: string;
  description: string;
  filePath: string;
  display: JsonEntityDisplay;
  rawJson: string;
};

const importSections = {
  installers: {
    title: "설치 기사 데이터 가져오기",
    description: "전화번호 기준으로 저장합니다. 이미 존재하는 전화번호는 최신 업로드 값으로 갱신됩니다.",
    columns: installerColumns,
  },
} satisfies Record<
  DataImportKind,
  {
    title: string;
    description: string;
    columns: { key: string; label: string }[];
  }
>;

export default function DataImportForm({
  kind,
  columnMapEntity,
}: {
  kind: DataImportKind;
  columnMapEntity: DataImportColumnMapEntity;
}) {
  const section = importSections[kind];

  return (
    <div className="max-w-5xl">
      <div className="grid gap-6">
        <ImportSection
          kind={kind}
          title={section.title}
          description={section.description}
          columns={section.columns}
        />
        <ColumnMapReference columnMapEntity={columnMapEntity} />
      </div>
    </div>
  );
}

function ColumnMapReference({
  columnMapEntity,
}: {
  columnMapEntity: DataImportColumnMapEntity;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-zinc-950">{columnMapEntity.label}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-700">{columnMapEntity.description}</p>
        <p className="mt-2 break-all font-mono text-xs text-zinc-500">{columnMapEntity.filePath}</p>
      </div>

      <JsonEntityTable rows={getColumnMapRows(columnMapEntity.display)} />

      <details className="border-t border-zinc-200">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50">
          원문 JSON
        </summary>
        <pre className="max-h-80 overflow-auto bg-zinc-50 px-5 py-4 font-mono text-xs leading-6 whitespace-pre-wrap text-zinc-950">
          {columnMapEntity.rawJson}
        </pre>
      </details>
    </section>
  );
}

function JsonEntityTable({ rows }: { rows: JsonEntityKeyValueRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
          <tr>
            <th className="w-[36%] border-b border-zinc-200 px-4 py-3">키</th>
            <th className="border-b border-zinc-200 px-4 py-3">값</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-zinc-100 last:border-0">
              <td className="align-top px-4 py-3 font-mono text-xs leading-5 break-all text-zinc-700">
                {row.key}
              </td>
              <td className="align-top px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words text-zinc-950">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getColumnMapRows(display: JsonEntityDisplay) {
  if (display.kind === "object") return display.rows;
  return display.items.flatMap((item) => item.rows);
}

function ImportSection({
  kind,
  title,
  description,
  columns,
}: {
  kind: DataImportKind;
  title: string;
  description: string;
  columns: { key: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    importBackofficeDataAction,
    initialDataImportActionState,
  );
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setFilePreview(null);
    setPreviewError(null);

    if (!file) return;

    try {
      const result = await parseSelectedFile(file);
      setFilePreview({
        total: result.total,
        skipped: result.skipped,
        rows: toPreviewRows(result.rows, columns),
      });
    } catch (error) {
      console.error("[backoffice/data-import/preview]", error);
      setPreviewError("파일 내용을 읽을 수 없습니다. 컬럼과 파일 형식을 확인해 주세요.");
    }
  }

  const previewRows = state.ok ? state.preview : filePreview?.rows.length ? filePreview.rows : state.preview;
  const previewTitle = state.ok ? "처리 데이터 미리보기" : filePreview ? "저장될 데이터 미리보기" : "처리 데이터 미리보기";

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5">
      <div>
        <h3 className="text-lg font-semibold text-zinc-950">{title}</h3>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>

      <form action={formAction} className="mt-5 grid gap-5">
        <input type="hidden" name="kind" value={kind} />

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-600">CSV/엑셀 파일</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-zinc-700"
          />
        </label>

        {state.ok ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <ResultMetric label="전체" value={state.total} />
            <ResultMetric label="저장" value={state.imported} tone="success" />
            <ResultMetric label="중복" value={state.duplicates} />
            <ResultMetric label="제외" value={state.failed} tone={state.failed > 0 ? "danger" : "default"} />
          </div>
        ) : null}

        {state.message ? (
          <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {state.message}
          </div>
        ) : null}

        {state.error ? (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage[state.error] ?? state.error}
          </div>
        ) : null}

        {previewError ? (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {previewError}
          </div>
        ) : null}

        <div>
          <LoadingButton
            type="submit"
            loading={pending}
            loadingLabel="저장 중..."
            className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            저장
          </LoadingButton>
        </div>
      </form>

      {previewRows.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h4 className="text-base font-semibold text-zinc-950">{previewTitle}</h4>
            <span className="text-sm text-zinc-500">최대 20건</span>
            {filePreview && !state.ok ? (
              <span className="text-sm text-zinc-500">
                전체 {filePreview.total}건, 저장 대상 {filePreview.total - filePreview.skipped}건, 제외 {filePreview.skipped}건
              </span>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-max min-w-full border-collapse text-left text-sm whitespace-nowrap">
                <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} className="border-b border-zinc-200 px-4 py-3">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-b border-zinc-100 last:border-0">
                      {columns.map((column) => (
                        <td key={column.key} className="px-4 py-3 text-zinc-700">
                          {formatCell(row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}

async function parseSelectedFile(file: File) {
  if (isExcelFile(file)) {
    const data = await file.arrayBuffer();
    return parseInstallerWorkbook(data);
  }

  const text = await file.text();
  return parseInstallerCsv(text);
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function toPreviewRows(
  rows: InstallerImportRow[],
  columns: { key: string; label: string }[],
): PreviewRow[] {
  return rows.slice(0, 20).map((row) =>
    Object.fromEntries(
      columns.map((column) => [column.key, row[column.key as keyof typeof row] ?? null]),
    ) as PreviewRow,
  );
}

function ResultMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger";
}) {
  const valueClass =
    tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-red-700" : "text-zinc-950";

  return (
    <div className="rounded-md border border-zinc-200 px-4 py-3">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function formatCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}
