"use client";

import { useMemo, useState } from "react";
import { ResultBadge, TallyText, VerdictBadge } from "../_components/WallpadBadges";
import {
  WALLPAD_FAIL_REASON_LABEL,
  WALLPAD_NOTE_KIND_LABEL,
  WALLPAD_VERDICTS,
  WALLPAD_VERDICT_HELP,
  type WallpadFailReason,
} from "@/lib/installation/wallpad/constants";
import { groupCasesBySite, searchWallpadCompat, tallyCasesByModel } from "@/lib/installation/wallpad/search";
import type { WallpadCaseRow, WallpadModelRow, WallpadNoteRow } from "@/lib/installation/wallpad/service";

// 공개 조회 화면. 검색어 하나로 모델명·제조사·아파트명을 같이 찾는다. 읽기 전용.
export default function Rf447SearchClient({
  models,
  cases,
  notes,
}: {
  models: WallpadModelRow[];
  cases: WallpadCaseRow[];
  notes: WallpadNoteRow[];
}) {
  const [query, setQuery] = useState("");
  const tallies = useMemo(() => tallyCasesByModel(models, cases), [models, cases]);
  const found = useMemo(() => searchWallpadCompat({ models, cases, notes }, query), [models, cases, notes, query]);
  const hasQuery = query.trim().length > 0;
  const sites = groupCasesBySite(found.cases);
  const nothing = hasQuery && found.models.length === 0 && found.cases.length === 0 && found.notes.length === 0;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
      <div className="mx-auto grid max-w-3xl gap-4">
        <header>
          <p className="text-xs font-semibold tracking-wide text-zinc-500">AQARA · RF447</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-950">RF447 월패드 사전 호환 조회</h1>
          <p className="mt-1 text-sm text-zinc-500">
            등록 월패드 {models.length}개 모델 · 단지 현장 사례 {cases.length}건
          </p>
        </header>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          <strong>현장 확인 필수.</strong> 이 결과는 사전 참고 자료입니다. 같은 월패드 모델도 아파트별 사양·배선·설정에
          따라 연동 여부가 달라질 수 있으며, 최종 설치 가능 여부는 설치기사가 현장에서 확인합니다.
        </div>

        <div className="sticky top-0 z-10 -mx-4 bg-zinc-50/95 px-4 py-2 backdrop-blur">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="월패드 모델명 · 제조사 · 아파트명"
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base focus:border-zinc-500 focus:outline-none"
            enterKeyHint="search"
          />
        </div>

        {!hasQuery ? <VerdictGuide /> : null}

        {nothing ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            일치하는 모델·단지가 없습니다. <strong>등록되지 않은 것은 연동 불가를 뜻하지 않습니다.</strong> 모델명은
            월패드 옆면이나 뒷면 라벨에서 확인할 수 있습니다.
          </p>
        ) : null}

        {found.notes.map((n) => (
          <section key={n.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {WALLPAD_NOTE_KIND_LABEL[n.kind] ?? n.kind} 현장 의견
              </span>
              <span className="font-semibold text-zinc-900">{n.title}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{n.note}</p>
            {n.sourceType || n.reportedOn ? (
              <p className="mt-2 text-xs text-zinc-500">
                근거: {[n.sourceType, n.reportedOn].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </section>
        ))}

        {sites.length > 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">아파트 현장 사례 ({sites.length}개 단지)</h2>
            <div className="grid gap-4">
              {sites.map((site) => (
                <div key={site.key} className="border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-zinc-900">{site.siteName}</span>
                    <TallyText tally={site.tally} />
                  </div>
                  <ul className="mt-2 grid gap-2">
                    {site.cases.map((c) => (
                      <li key={c.id} className="text-sm text-zinc-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <ResultBadge result={c.result} />
                          <span>{[c.brand, c.model].filter(Boolean).join(" ") || "월패드 모델 미확인"}</span>
                          {c.failReason ? (
                            <span className="text-xs text-zinc-500">
                              · {WALLPAD_FAIL_REASON_LABEL[c.failReason as WallpadFailReason] ?? c.failReason}
                            </span>
                          ) : null}
                          {c.occurredOn ? <span className="text-xs text-zinc-400">· {c.occurredOn}</span> : null}
                        </div>
                        {c.note ? <p className="mt-1 text-xs leading-relaxed text-zinc-500">{c.note}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              해당 단지의 사례일 뿐 같은 단지 모든 세대의 설치를 보장하지 않습니다.
            </p>
          </section>
        ) : null}

        {found.models.length > 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">월패드 모델 ({found.models.length})</h2>
            <div className="grid gap-4">
              {found.models.map((m) => (
                <div key={m.id} className="border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <VerdictBadge verdict={m.verdict} />
                    <span className="font-semibold text-zinc-900">
                      {m.brand} · {m.model}
                    </span>
                    {tallies.get(m.id) ? <TallyText tally={tallies.get(m.id)} /> : null}
                  </div>
                  {m.aliases.length > 0 ? (
                    <p className="mt-1 text-xs text-zinc-500">같은 모델: {m.aliases.join(", ")}</p>
                  ) : null}
                  {m.note ? <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{m.note}</p> : null}
                  {m.sourceType || m.verifiedOn ? (
                    <p className="mt-1 text-xs text-zinc-400">
                      근거: {[m.sourceType, m.verifiedOn].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="pb-6 pt-2 text-center text-xs text-zinc-400">
          미등록 모델은 연동 불가를 뜻하지 않습니다 · 현장 경험 기반 자료이며 공식 호환 보증이 아닙니다
        </footer>
      </div>
    </main>
  );
}

function VerdictGuide() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">판정 기준</h2>
      <dl className="grid gap-2.5 text-sm">
        {WALLPAD_VERDICTS.map((v) => (
          <div key={v} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-3">
            <dt>
              <VerdictBadge verdict={v} />
            </dt>
            <dd className="text-zinc-600">{WALLPAD_VERDICT_HELP[v]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
