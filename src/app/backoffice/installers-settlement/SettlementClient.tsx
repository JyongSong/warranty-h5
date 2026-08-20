"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  InstallerSettlementSummary,
  SettlementLineView,
  SettlementPeriodView,
} from "@/lib/installation/settlement/service";
import type { EffectiveRates } from "@/lib/installation/settlement/rates";
import type { InstallerRateOverrideView } from "@/lib/installation/settlement/installer-rates";
import {
  collectLinesIntoPeriodAction,
  createSettlementPeriodAction,
  removeLineFromPeriodAction,
  setPeriodSettledAction,
  upsertInstallerRateOverrideAction,
} from "./actions";

const won = (n: number) => `${n.toLocaleString()}원`;
const kstDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const SOURCE_LABEL: Record<string, string> = { INSTALL: "설치", AS: "A/S" };

type Filter = { periodId: string; installerId: string; startDate: string; endDate: string };

export default function SettlementClient({
  tab,
  periods,
  filter,
  hasFilter,
  lines,
  summary,
  rateDefaults,
  rateOverrides,
}: {
  tab: string;
  periods: SettlementPeriodView[];
  filter: Filter;
  hasFilter: boolean;
  lines: SettlementLineView[];
  summary: InstallerSettlementSummary[];
  rateDefaults: EffectiveRates;
  rateOverrides: InstallerRateOverrideView[];
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-950">기사 정산</h1>
        <nav className="flex gap-2">
          <TabLink label="정산" active={tab === "settlement"} href="/backoffice/installers-settlement?tab=settlement" />
          <TabLink label="요율 설정" active={tab === "rates"} href="/backoffice/installers-settlement?tab=rates" />
        </nav>
      </div>

      {tab === "rates" ? (
        <RatesTab rateDefaults={rateDefaults} rateOverrides={rateOverrides} />
      ) : (
        <SettlementTab
          periods={periods}
          filter={filter}
          hasFilter={hasFilter}
          lines={lines}
          summary={summary}
        />
      )}
    </div>
  );
}

function TabLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${
        active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
    </a>
  );
}

// ── Settlement tab ────────────────────────────────────────────────────
function SettlementTab({
  periods,
  filter,
  hasFilter,
  lines,
  summary,
}: {
  periods: SettlementPeriodView[];
  filter: Filter;
  hasFilter: boolean;
  lines: SettlementLineView[];
  summary: InstallerSettlementSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // create-period form
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // filter form
  const [fPeriod, setFPeriod] = useState(filter.periodId);
  const [fStart, setFStart] = useState(filter.startDate);
  const [fEnd, setFEnd] = useState(filter.endDate);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "실패");
      else router.refresh();
    });
  }

  function applyFilter() {
    const params = new URLSearchParams({ tab: "settlement" });
    if (fPeriod) params.set("periodId", fPeriod);
    if (fStart) params.set("startDate", fStart);
    if (fEnd) params.set("endDate", fEnd);
    router.push(`/backoffice/installers-settlement?${params.toString()}`);
  }

  const exportParams = new URLSearchParams();
  if (filter.periodId) exportParams.set("periodId", filter.periodId);
  if (filter.installerId) exportParams.set("installerId", filter.installerId);
  if (filter.startDate) exportParams.set("startDate", filter.startDate);
  if (filter.endDate) exportParams.set("endDate", filter.endDate);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

      {/* Create period */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-zinc-700">정산 주기 생성</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Labeled label="주기명">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026년 8월" />
          </Labeled>
          <Labeled label="시작일">
            <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Labeled>
          <Labeled label="종료일">
            <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Labeled>
          <button
            className={primaryBtn}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await createSettlementPeriodAction({ name, startDate: start, endDate: end });
                if (res.ok) {
                  setName("");
                  setStart("");
                  setEnd("");
                }
                return res;
              })
            }
          >
            생성
          </button>
        </div>
      </section>

      {/* Periods */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-zinc-700">정산 주기</h2>
        {periods.length === 0 ? (
          <p className="text-sm text-zinc-400">아직 생성된 주기가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500">
                  <th className="py-2">주기</th>
                  <th>기간</th>
                  <th>상태</th>
                  <th className="text-right">건수</th>
                  <th className="text-right">합계</th>
                  <th className="text-right">작업</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="text-zinc-600">
                      {p.startDate} ~ {p.endDate}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.status === "SETTLED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {p.status === "SETTLED" ? "결산 완료" : "결산 대기"}
                      </span>
                    </td>
                    <td className="text-right">{p.lineCount}</td>
                    <td className="text-right font-semibold">{won(p.totalAmount)}</td>
                    <td className="space-x-2 whitespace-nowrap py-2 text-right">
                      <a className={linkBtn} href={`/backoffice/installers-settlement?tab=settlement&periodId=${p.id}`}>
                        보기
                      </a>
                      {p.status === "OPEN" ? (
                        <button
                          className={linkBtn}
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              const res = await collectLinesIntoPeriodAction(p.id);
                              return res;
                            })
                          }
                        >
                          미배정 수집
                        </button>
                      ) : null}
                      <button
                        className={linkBtn}
                        disabled={pending}
                        onClick={() => run(() => setPeriodSettledAction({ periodId: p.id, settled: p.status !== "SETTLED" }))}
                      >
                        {p.status === "SETTLED" ? "결산 해제" : "결산 확정"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Filter + results */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Labeled label="주기">
              <select className={inputCls} value={fPeriod} onChange={(e) => setFPeriod(e.target.value)}>
                <option value="">(선택 안 함)</option>
                <option value="__none__">미배정만</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="시작일">
              <input type="date" className={inputCls} value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </Labeled>
            <Labeled label="종료일">
              <input type="date" className={inputCls} value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </Labeled>
            <button className={primaryBtn} onClick={applyFilter}>
              조회
            </button>
          </div>
          {hasFilter ? (
            <a className={primaryBtn} href={`/api/settlement/export?${exportParams.toString()}`}>
              엑셀 내보내기
            </a>
          ) : null}
        </div>

        {!hasFilter ? (
          <p className="text-sm text-zinc-400">주기 또는 기간을 선택해 조회하세요.</p>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-bold text-zinc-500">기사별 합계</h3>
              {summary.length === 0 ? (
                <p className="text-sm text-zinc-400">해당 조건의 정산 내역이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-zinc-500">
                        <th className="py-2">기사</th>
                        <th className="text-right">설치</th>
                        <th className="text-right">A/S</th>
                        <th className="text-right">연동비</th>
                        <th className="text-right">출장비</th>
                        <th className="text-right">장거리</th>
                        <th className="text-right">야간/휴일</th>
                        <th className="text-right">용역비</th>
                        <th className="text-right">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((s) => (
                        <tr key={s.installerId} className="border-b last:border-0">
                          <td className="py-2 font-medium">{s.installerName}</td>
                          <td className="text-right">{s.installCount}</td>
                          <td className="text-right">{s.asCount}</td>
                          <td className="text-right">{won(s.linkageFee)}</td>
                          <td className="text-right">{won(s.travelFee)}</td>
                          <td className="text-right">{won(s.longDistanceFee)}</td>
                          <td className="text-right">{won(s.nightWeekendFee)}</td>
                          <td className="text-right">{won(s.serviceFee)}</td>
                          <td className="text-right font-bold">{won(s.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold text-zinc-500">상세 내역 ({lines.length})</h3>
              {lines.length === 0 ? null : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-zinc-500">
                        <th className="py-2">기사</th>
                        <th>구분</th>
                        <th>완료일</th>
                        <th className="text-right">합계</th>
                        <th>주기</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{l.installerName}</td>
                          <td>{SOURCE_LABEL[l.sourceType] ?? l.sourceType}</td>
                          <td className="text-zinc-600">{kstDate(l.completedAt)}</td>
                          <td className="text-right font-semibold">{won(l.totalAmount)}</td>
                          <td className="text-zinc-500">{l.periodId ? "배정됨" : "미배정"}</td>
                          <td className="text-right">
                            {l.periodId ? (
                              <button
                                className={linkBtn}
                                disabled={pending}
                                onClick={() => run(() => removeLineFromPeriodAction(l.id))}
                              >
                                주기 제외
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Rates tab ─────────────────────────────────────────────────────────
function RatesTab({
  rateDefaults,
  rateOverrides,
}: {
  rateDefaults: EffectiveRates;
  rateOverrides: InstallerRateOverrideView[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-bold text-zinc-700">전역 기본 요율</h2>
        <p className="mb-3 text-xs text-zinc-400">
          변경은 시스템 설정(installation.settlement.*)에서. 기사별로 아래에서 재정의할 수 있습니다.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="연동비 · APP" value={won(rateDefaults.linkageAppFee)} />
          <Stat label="연동비 · 허브" value={won(rateDefaults.linkageHubFee)} />
          <Stat label="출장비" value={won(rateDefaults.travelFee)} />
          <Stat label="야간 할증" value={won(rateDefaults.nightSurcharge)} />
          <Stat label="휴일 할증" value={won(rateDefaults.weekendSurcharge)} />
          <Stat label="야간 시간대" value={`${rateDefaults.nightStartHour}시~${rateDefaults.nightEndHour}시`} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-bold text-zinc-700">기사별 재정의</h2>
        <p className="mb-3 text-xs text-zinc-400">빈칸 = 전역 기본값 사용. 숫자 입력 시 그 기사만 해당 항목을 대체합니다.</p>
        <div className="space-y-2">
          {rateOverrides.map((r) => (
            <RateOverrideRow key={r.installerId} row={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RateOverrideRow({ row }: { row: InstallerRateOverrideView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [vals, setVals] = useState({
    linkageAppFee: row.linkageAppFee?.toString() ?? "",
    linkageHubFee: row.linkageHubFee?.toString() ?? "",
    travelFee: row.travelFee?.toString() ?? "",
    nightSurcharge: row.nightSurcharge?.toString() ?? "",
    weekendSurcharge: row.weekendSurcharge?.toString() ?? "",
  });

  const parse = (s: string): number | null => {
    const digits = s.replace(/[^\d]/g, "");
    return digits === "" ? null : Number(digits);
  };

  function save() {
    setErr(null);
    setSaved(false);
    startTransition(async () => {
      const res = await upsertInstallerRateOverrideAction({
        installerId: row.installerId,
        linkageAppFee: parse(vals.linkageAppFee),
        linkageHubFee: parse(vals.linkageHubFee),
        travelFee: parse(vals.travelFee),
        nightSurcharge: parse(vals.nightSurcharge),
        weekendSurcharge: parse(vals.weekendSurcharge),
      });
      if (!res.ok) setErr(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const field = (key: keyof typeof vals, ph: string) => (
    <input
      className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm"
      inputMode="numeric"
      placeholder={ph}
      value={vals[key]}
      onChange={(e) => {
        setVals({ ...vals, [key]: e.target.value });
        setSaved(false);
      }}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b py-2 last:border-0">
      <span className="w-28 truncate text-sm font-medium">{row.installerName}</span>
      {field("linkageAppFee", "APP")}
      {field("linkageHubFee", "허브")}
      {field("travelFee", "출장")}
      {field("nightSurcharge", "야간")}
      {field("weekendSurcharge", "휴일")}
      <button className={primaryBtn} disabled={pending} onClick={save}>
        저장
      </button>
      {saved ? <span className="text-xs text-emerald-600">저장됨</span> : null}
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-sm font-bold text-zinc-900">{value}</div>
    </div>
  );
}

const inputCls = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm";
const primaryBtn = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50";
const linkBtn = "text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50";
