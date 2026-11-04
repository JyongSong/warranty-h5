"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import BackofficePageHeader from "../BackofficePageHeader";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import {
  WALLPAD_BRANDS,
  WALLPAD_CASE_RESULTS,
  WALLPAD_CASE_RESULT_LABEL,
  WALLPAD_CASE_SOURCE_LABEL,
  WALLPAD_FAIL_REASONS,
  WALLPAD_FAIL_REASON_LABEL,
  WALLPAD_NOTE_KINDS,
  WALLPAD_NOTE_KIND_LABEL,
  WALLPAD_VERDICTS,
  WALLPAD_VERDICT_HELP,
  WALLPAD_VERDICT_LABEL,
  type WallpadCaseResult,
  type WallpadFailReason,
  type WallpadVerdict,
} from "@/lib/installation/wallpad/constants";
import {
  groupCasesBySite,
  searchWallpadCompat,
  tallyCasesByModel,
  type CaseTally,
} from "@/lib/installation/wallpad/search";
import type { WallpadCaseRow, WallpadModelRow, WallpadNoteRow } from "@/lib/installation/wallpad/service";
import {
  deleteWallpadCaseAction,
  deleteWallpadModelAction,
  deleteWallpadNoteAction,
  saveWallpadCaseAction,
  saveWallpadModelAction,
  saveWallpadNoteAction,
} from "./actions";

type Tab = "search" | "models" | "cases" | "notes";
type ActionResult = { ok: true } | { ok: false; error: string };

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "search", label: "통합 검색" },
  { value: "models", label: "월패드 모델" },
  { value: "cases", label: "단지 현장 사례" },
  { value: "notes", label: "제조사·시공사 의견" },
];

const ERROR_TEXT: Record<string, string> = {
  UNAUTHORIZED: "권한이 없습니다.",
  BRAND_REQUIRED: "제조사를 입력해 주세요.",
  MODEL_REQUIRED: "모델명을 입력해 주세요.",
  MODEL_DUPLICATE: "같은 모델이 이미 있습니다.",
  VERDICT_INVALID: "판정을 골라 주세요.",
  SITE_NAME_REQUIRED: "단지명을 입력해 주세요.",
  RESULT_INVALID: "결과를 골라 주세요.",
  FAIL_REASON_INVALID: "실패 사유를 확인해 주세요.",
  KIND_INVALID: "구분을 골라 주세요.",
  TITLE_REQUIRED: "제목을 입력해 주세요.",
  NOTE_REQUIRED: "내용을 입력해 주세요.",
  DATE_INVALID: "날짜는 YYYY-MM-DD 형식으로 입력해 주세요.",
};

const VERDICT_STYLE: Record<WallpadVerdict, string> = {
  COMPATIBLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  LIKELY: "bg-sky-50 text-sky-700 ring-sky-200",
  DIFFICULT: "bg-amber-50 text-amber-700 ring-amber-200",
  INCOMPATIBLE: "bg-red-50 text-red-700 ring-red-200",
  CAUTION_OLD: "bg-orange-50 text-orange-700 ring-orange-200",
  UNVERIFIED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const RESULT_STYLE: Record<WallpadCaseResult, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAIL: "bg-red-50 text-red-700 ring-red-200",
  SPECIAL: "bg-violet-50 text-violet-700 ring-violet-200",
};

type Editing =
  | { kind: "model"; row: WallpadModelRow | null }
  | { kind: "case"; row: WallpadCaseRow | null }
  | { kind: "note"; row: WallpadNoteRow | null }
  | null;

export default function WallpadCompatClient({
  models,
  cases,
  notes,
}: {
  models: WallpadModelRow[];
  cases: WallpadCaseRow[];
  notes: WallpadNoteRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  const tallies = useMemo(() => tallyCasesByModel(models, cases), [models, cases]);
  const found = useMemo(() => searchWallpadCompat({ models, cases, notes }, query), [models, cases, notes, query]);
  const hasQuery = query.trim().length > 0;
  const visibleModels = hasQuery ? found.models : models;
  const visibleCases = hasQuery ? found.cases : cases;
  const visibleNotes = hasQuery ? found.notes : notes;

  async function remove(label: string, action: () => Promise<ActionResult>) {
    if (!window.confirm(`${label}을(를) 삭제하시겠습니까?`)) return;
    const res = await action();
    if (!res.ok) {
      window.alert(ERROR_TEXT[res.error] ?? "삭제에 실패했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="p-6">
      <BackofficePageHeader
        title="월패드 호환 (RF447)"
        meta={`모델 ${models.length} · 현장 사례 ${cases.length} · 의견 ${notes.length}`}
        actions={
          tab === "search" ? null : (
            <button
              type="button"
              className={getBackofficeButtonClass("primary", "md")}
              onClick={() =>
                setEditing(
                  tab === "models"
                    ? { kind: "model", row: null }
                    : tab === "cases"
                      ? { kind: "case", row: null }
                      : { kind: "note", row: null },
                )
              }
            >
              {tab === "models" ? "모델 추가" : tab === "cases" ? "사례 추가" : "의견 추가"}
            </button>
          )
        }
      />

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        사전 참고 자료입니다. 같은 모델도 단지별 사양·배선·설정에 따라 결과가 다를 수 있으며, 최종 설치 가능 여부는
        현장에서 기사가 확인해야 합니다.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="월패드 모델명 · 제조사 · 아파트명 · 주소"
          className="h-10 w-full max-w-md rounded-md border border-zinc-300 px-3 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                tab === t.value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "search" ? (
        <SearchView
          hasQuery={hasQuery}
          models={found.models}
          cases={found.cases}
          notes={found.notes}
          tallies={tallies}
          onEditModel={(row) => setEditing({ kind: "model", row })}
          onEditCase={(row) => setEditing({ kind: "case", row })}
        />
      ) : null}

      {tab === "models" ? (
        <Table
          empty="모델이 없습니다."
          head={["제조사", "모델명", "판정", "현장 사례", "근거", "확인일", ""]}
          rows={visibleModels.map((m) => [
            m.brand,
            <div key="model">
              <div className="font-semibold text-zinc-900">{m.model}</div>
              {m.aliases.length > 0 ? <div className="text-xs text-zinc-500">별칭: {m.aliases.join(", ")}</div> : null}
            </div>,
            <VerdictBadge key="verdict" verdict={m.verdict} />,
            <TallyText key="tally" tally={tallies.get(m.id)} />,
            <div key="source" className="max-w-xs truncate text-xs text-zinc-500" title={m.note ?? ""}>
              {m.sourceType ?? "-"}
            </div>,
            m.verifiedOn ?? "-",
            <RowActions
              key="actions"
              onEdit={() => setEditing({ kind: "model", row: m })}
              onDelete={() => remove(m.model, () => deleteWallpadModelAction(m.id))}
            />,
          ])}
        />
      ) : null}

      {tab === "cases" ? (
        <Table
          empty="현장 사례가 없습니다."
          head={["일자", "단지", "월패드", "결과", "출처", ""]}
          rows={visibleCases.map((c) => [
            c.occurredOn ?? "-",
            <div key="site">
              <div className="font-semibold text-zinc-900">{c.siteName}</div>
              {c.siteAddress && c.siteAddress !== c.siteName ? (
                <div className="text-xs text-zinc-500">{c.siteAddress}</div>
              ) : null}
            </div>,
            [c.brand, c.model].filter(Boolean).join(" ") || "-",
            <div key="result">
              <ResultBadge result={c.result} />
              {c.failReason ? (
                <div className="mt-1 text-xs text-zinc-500">
                  {WALLPAD_FAIL_REASON_LABEL[c.failReason as WallpadFailReason] ?? c.failReason}
                </div>
              ) : null}
            </div>,
            <SourceText key="source" row={c} />,
            <RowActions
              key="actions"
              onEdit={() => setEditing({ kind: "case", row: c })}
              onDelete={() => remove(c.siteName, () => deleteWallpadCaseAction(c.id))}
            />,
          ])}
        />
      ) : null}

      {tab === "notes" ? (
        <div className="grid gap-3">
          {visibleNotes.length === 0 ? <p className="text-sm text-zinc-500">의견이 없습니다.</p> : null}
          {visibleNotes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              actions={
                <RowActions
                  onEdit={() => setEditing({ kind: "note", row: n })}
                  onDelete={() => remove(n.title, () => deleteWallpadNoteAction(n.id))}
                />
              }
            />
          ))}
        </div>
      ) : null}

      {editing?.kind === "model" ? (
        <ModelDialog row={editing.row} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
      ) : null}
      {editing?.kind === "case" ? (
        <CaseDialog row={editing.row} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
      ) : null}
      {editing?.kind === "note" ? (
        <NoteDialog row={editing.row} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
      ) : null}
    </div>
  );
}

// ─── 통합 검색 ───────────────────────────────────────────────────────────

function SearchView({
  hasQuery,
  models,
  cases,
  notes,
  tallies,
  onEditModel,
  onEditCase,
}: {
  hasQuery: boolean;
  models: WallpadModelRow[];
  cases: WallpadCaseRow[];
  notes: WallpadNoteRow[];
  tallies: Map<string, CaseTally>;
  onEditModel: (row: WallpadModelRow) => void;
  onEditCase: (row: WallpadCaseRow) => void;
}) {
  if (!hasQuery) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">판정 기준</h3>
        <dl className="grid gap-2 text-sm">
          {WALLPAD_VERDICTS.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <dt className="w-36 shrink-0">
                <VerdictBadge verdict={v} />
              </dt>
              <dd className="text-zinc-600">{WALLPAD_VERDICT_HELP[v]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-zinc-500">
          완료 등록에서 기사가 남긴 월패드 연동 결과는 본사 승인 때 단지 현장 사례로 자동으로 쌓입니다. 미등록 모델은
          연동 불가를 뜻하지 않습니다.
        </p>
      </section>
    );
  }

  const sites = groupCasesBySite(cases);
  const nothing = models.length === 0 && cases.length === 0 && notes.length === 0;

  return (
    <div className="grid gap-4">
      {nothing ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          일치하는 모델·단지·의견이 없습니다. 등록되지 않은 것은 연동 불가를 뜻하지 않습니다.
        </p>
      ) : null}

      {notes.length > 0 ? (
        <section className="grid gap-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} highlight />
          ))}
        </section>
      ) : null}

      {sites.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">단지 현장 사례 ({sites.length}개 단지)</h3>
          <div className="grid gap-4">
            {sites.map((site) => (
              <div key={site.key} className="border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold text-zinc-900">{site.siteName}</span>
                  {site.siteAddress && site.siteAddress !== site.siteName ? (
                    <span className="text-xs text-zinc-500">{site.siteAddress}</span>
                  ) : null}
                  <TallyText tally={site.tally} />
                </div>
                <ul className="mt-2 grid gap-1.5">
                  {site.cases.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                      <ResultBadge result={c.result} />
                      <span>{[c.brand, c.model].filter(Boolean).join(" ") || "모델 미확인"}</span>
                      {c.failReason ? (
                        <span className="text-xs text-zinc-500">
                          · {WALLPAD_FAIL_REASON_LABEL[c.failReason as WallpadFailReason] ?? c.failReason}
                        </span>
                      ) : null}
                      <span className="text-xs text-zinc-400">
                        · {c.occurredOn ?? "날짜 없음"} · <SourceText row={c} />
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditCase(c)}
                        className="text-xs font-semibold text-zinc-500 underline hover:text-zinc-900"
                      >
                        수정
                      </button>
                      {c.note ? <div className="w-full pl-1 text-xs text-zinc-500">{c.note}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {models.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">월패드 모델 ({models.length})</h3>
          <div className="grid gap-4">
            {models.map((m) => (
              <div key={m.id} className="border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <VerdictBadge verdict={m.verdict} />
                  <span className="font-semibold text-zinc-900">
                    {m.brand} · {m.model}
                  </span>
                  <TallyText tally={tallies.get(m.id)} />
                  <button
                    type="button"
                    onClick={() => onEditModel(m)}
                    className="text-xs font-semibold text-zinc-500 underline hover:text-zinc-900"
                  >
                    수정
                  </button>
                </div>
                {m.note ? <p className="mt-1.5 text-sm text-zinc-600">{m.note}</p> : null}
                <p className="mt-1 text-xs text-zinc-400">
                  {m.sourceType ?? "근거 미기록"}
                  {m.verifiedOn ? ` · ${m.verifiedOn}` : ""}
                  {m.sourceUrl ? (
                    <>
                      {" · "}
                      <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                        원문
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ─── 작은 표시 요소 ──────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: WallpadVerdict }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${VERDICT_STYLE[verdict]}`}>
      {WALLPAD_VERDICT_LABEL[verdict]}
    </span>
  );
}

function ResultBadge({ result }: { result: WallpadCaseResult }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${RESULT_STYLE[result] ?? ""}`}>
      {WALLPAD_CASE_RESULT_LABEL[result] ?? result}
    </span>
  );
}

function TallyText({ tally }: { tally: CaseTally | undefined }) {
  if (!tally) return <span className="text-xs text-zinc-400">사례 없음</span>;
  const parts = [
    tally.success ? `성공 ${tally.success}` : null,
    tally.fail ? `실패 ${tally.fail}` : null,
    tally.special ? `특수 ${tally.special}` : null,
  ].filter(Boolean);
  return <span className="text-xs font-medium text-zinc-600">{parts.join(" · ")}</span>;
}

function SourceText({ row }: { row: WallpadCaseRow }) {
  const label = WALLPAD_CASE_SOURCE_LABEL[row.source] ?? row.source;
  if (row.source === "COMPLETION" && row.installationOrderId) {
    return (
      <a href={`/backoffice/installations/${row.installationOrderId}`} className="underline">
        {label}
      </a>
    );
  }
  if (row.sourceUrl) {
    return (
      <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="underline">
        {label}
      </a>
    );
  }
  return <>{label}</>;
}

function NoteCard({ note, highlight, actions }: { note: WallpadNoteRow; highlight?: boolean; actions?: ReactNode }) {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {WALLPAD_NOTE_KIND_LABEL[note.kind] ?? note.kind}
          </span>
          <span className="font-semibold text-zinc-900">{note.title}</span>
        </div>
        {actions}
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">{note.note}</p>
      <p className="mt-2 text-xs text-zinc-500">
        키워드: {note.keywords.join(", ") || "-"}
        {note.sourceType ? ` · ${note.sourceType}` : ""}
        {note.reportedOn ? ` · ${note.reportedOn}` : ""}
      </p>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onEdit} className={getBackofficeButtonClass("secondary", "sm")}>
        수정
      </button>
      <button type="button" onClick={onDelete} className={getBackofficeButtonClass("dangerSecondary", "sm")}>
        삭제
      </button>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-6 text-center text-zinc-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="align-top">
                {cells.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-zinc-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── 입력 대화상자 ───────────────────────────────────────────────────────

function useSave(onSaved: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      setError(ERROR_TEXT[res.error] ?? "저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    onSaved();
    onClose();
  }
  return { busy, error, save };
}

function Dialog({
  title,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        className="mt-10 w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <h3 className="mb-4 text-lg font-semibold text-zinc-950">{title}</h3>
        <div className="grid gap-3">{children}</div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={getBackofficeButtonClass("secondary", "md")}>
            취소
          </button>
          <button type="submit" disabled={busy} className={getBackofficeButtonClass("primary", "md")}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-9 rounded-md border border-zinc-300 px-3 text-sm focus:border-zinc-500 focus:outline-none";
const textareaClass = "min-h-20 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

function ModelDialog({ row, onClose, onSaved }: { row: WallpadModelRow | null; onClose: () => void; onSaved: () => void }) {
  const { busy, error, save } = useSave(onSaved, onClose);
  const [form, setForm] = useState({
    brand: row?.brand ?? "",
    model: row?.model ?? "",
    aliases: row?.aliases.join(", ") ?? "",
    verdict: row?.verdict ?? "UNVERIFIED",
    note: row?.note ?? "",
    sourceType: row?.sourceType ?? "",
    sourceUrl: row?.sourceUrl ?? "",
    verifiedOn: row?.verifiedOn ?? "",
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog
      title={row ? "월패드 모델 수정" : "월패드 모델 추가"}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => save(() => saveWallpadModelAction({ id: row?.id, ...form }))}
    >
      <Field label="제조사 (필수)">
        <input className={inputClass} value={form.brand} onChange={set("brand")} list="wallpad-brand-options" />
        <BrandOptions />
      </Field>
      <Field label="모델명 (필수)">
        <input className={inputClass} value={form.model} onChange={set("model")} />
      </Field>
      <Field label="별칭 (쉼표로 구분, 색상·끝자리만 다른 같은 모델)">
        <input className={inputClass} value={form.aliases} onChange={set("aliases")} />
      </Field>
      <Field label="판정">
        <select className={inputClass} value={form.verdict} onChange={set("verdict")}>
          {WALLPAD_VERDICTS.map((v) => (
            <option key={v} value={v}>
              {WALLPAD_VERDICT_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="설명">
        <textarea className={textareaClass} value={form.note} onChange={set("note")} />
      </Field>
      <Field label="근거 종류 (예: 아카라 공식 연동 목록, 기사 구두 제보)">
        <input className={inputClass} value={form.sourceType} onChange={set("sourceType")} />
      </Field>
      <Field label="근거 링크">
        <input className={inputClass} value={form.sourceUrl} onChange={set("sourceUrl")} />
      </Field>
      <Field label="확인일">
        <input type="date" className={inputClass} value={form.verifiedOn} onChange={set("verifiedOn")} />
      </Field>
    </Dialog>
  );
}

function CaseDialog({ row, onClose, onSaved }: { row: WallpadCaseRow | null; onClose: () => void; onSaved: () => void }) {
  const { busy, error, save } = useSave(onSaved, onClose);
  const [form, setForm] = useState({
    siteName: row?.siteName ?? "",
    siteAddress: row?.siteAddress ?? "",
    brand: row?.brand ?? "",
    model: row?.model ?? "",
    result: row?.result ?? "SUCCESS",
    failReason: row?.failReason ?? "",
    note: row?.note ?? "",
    sourceUrl: row?.sourceUrl ?? "",
    occurredOn: row?.occurredOn ?? "",
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog
      title={row ? "현장 사례 수정" : "현장 사례 추가"}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => save(() => saveWallpadCaseAction({ id: row?.id, ...form }))}
    >
      {row?.source === "COMPLETION" ? (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          완료 등록에서 자동으로 만든 사례입니다. 단지명·모델명이 틀렸으면 여기서 고쳐 주세요.
        </p>
      ) : null}
      <Field label="단지명 (필수)">
        <input className={inputClass} value={form.siteName} onChange={set("siteName")} placeholder="예: 동탄역 경남아너스빌" />
      </Field>
      <Field label="도로명 주소 (선택, 같은 단지 사례를 묶는 데 씀)">
        <input
          className={inputClass}
          value={form.siteAddress}
          onChange={set("siteAddress")}
          placeholder="예: 경기 화성시 동탄대로 123"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="월패드 제조사">
          <input className={inputClass} value={form.brand} onChange={set("brand")} list="wallpad-brand-options" />
          <BrandOptions />
        </Field>
        <Field label="월패드 모델명">
          <input className={inputClass} value={form.model} onChange={set("model")} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="결과">
          <select className={inputClass} value={form.result} onChange={set("result")}>
            {WALLPAD_CASE_RESULTS.map((r) => (
              <option key={r} value={r}>
                {WALLPAD_CASE_RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="일자">
          <input type="date" className={inputClass} value={form.occurredOn} onChange={set("occurredOn")} />
        </Field>
      </div>
      {form.result === "FAIL" ? (
        <Field label="실패 사유">
          <select className={inputClass} value={form.failReason} onChange={set("failReason")}>
            <option value="">미기록</option>
            {WALLPAD_FAIL_REASONS.map((r) => (
              <option key={r} value={r}>
                {WALLPAD_FAIL_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="메모">
        <textarea className={textareaClass} value={form.note} onChange={set("note")} />
      </Field>
      <Field label="근거 링크">
        <input className={inputClass} value={form.sourceUrl} onChange={set("sourceUrl")} />
      </Field>
    </Dialog>
  );
}

function NoteDialog({ row, onClose, onSaved }: { row: WallpadNoteRow | null; onClose: () => void; onSaved: () => void }) {
  const { busy, error, save } = useSave(onSaved, onClose);
  const [form, setForm] = useState({
    kind: row?.kind ?? "BUILDER",
    title: row?.title ?? "",
    keywords: row?.keywords.join(", ") ?? "",
    note: row?.note ?? "",
    sourceType: row?.sourceType ?? "",
    reportedOn: row?.reportedOn ?? "",
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog
      title={row ? "의견 수정" : "의견 추가"}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => save(() => saveWallpadNoteAction({ id: row?.id, ...form }))}
    >
      <Field label="구분">
        <select className={inputClass} value={form.kind} onChange={set("kind")}>
          {WALLPAD_NOTE_KINDS.map((k) => (
            <option key={k} value={k}>
              {WALLPAD_NOTE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="제목 (필수)">
        <input className={inputClass} value={form.title} onChange={set("title")} placeholder="예: 자이(Xi) · GS건설" />
      </Field>
      <Field label="검색 키워드 (쉼표로 구분 — 검색어나 단지명에 들어 있으면 이 의견을 함께 보여 줌)">
        <input className={inputClass} value={form.keywords} onChange={set("keywords")} placeholder="예: 자이, Xi, GS건설" />
      </Field>
      <Field label="내용 (필수)">
        <textarea className={textareaClass} value={form.note} onChange={set("note")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="근거 종류">
          <input className={inputClass} value={form.sourceType} onChange={set("sourceType")} />
        </Field>
        <Field label="제보일">
          <input type="date" className={inputClass} value={form.reportedOn} onChange={set("reportedOn")} />
        </Field>
      </div>
    </Dialog>
  );
}

function BrandOptions() {
  return (
    <datalist id="wallpad-brand-options">
      {WALLPAD_BRANDS.map((brand) => (
        <option key={brand} value={brand} />
      ))}
    </datalist>
  );
}
