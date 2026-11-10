"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  InstallSettlementLineView,
  SettlementPeriodView,
} from "@/lib/installation/settlement/service";
import type { EffectiveRates } from "@/lib/installation/settlement/rates";
import type { InstallerRateOverrideView } from "@/lib/installation/settlement/installer-rates";
import {
  collectLinesIntoPeriodAction,
  createSettlementPeriodAction,
  setPeriodSettledAction,
  upsertInstallerRateOverrideAction,
} from "./actions";

const won = (n: number) => `${n.toLocaleString()}원`;
const kstDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Filter = { periodId: string; startDate: string; endDate: string };

type InstallerGroup = {
  installerId: string;
  installerName: string;
  count: number;
  totalAmount: number;
  lines: InstallSettlementLineView[];
};

export default function SettlementClient({
  tab,
  showStatementsTab,
  periods,
  filter,
  lines,
  rateDefaults,
  rateOverrides,
  agentProxyBaseFee,
}: {
  tab: string;
  /** 정산 기능 공개 전에는 월 정산서 탭을 숨긴다(주소로는 들어갈 수 있다) */
  showStatementsTab: boolean;
  periods: SettlementPeriodView[];
  filter: Filter;
  lines: InstallSettlementLineView[];
  rateDefaults: EffectiveRates;
  rateOverrides: InstallerRateOverrideView[];
  agentProxyBaseFee: number;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-950">기사 정산</h1>
        <nav className="flex gap-2">
          <TabLink label="정산" active={tab === "settlement"} href="/backoffice/installers-settlement?tab=settlement" />
          {showStatementsTab ? (
            <TabLink label="월 정산서" active={tab === "statements"} href="/backoffice/installers-settlement?tab=statements" />
          ) : null}
          <TabLink label="요율 설정" active={tab === "rates"} href="/backoffice/installers-settlement?tab=rates" />
        </nav>
      </div>

      {tab === "rates" ? (
        <RatesTab rateDefaults={rateDefaults} rateOverrides={rateOverrides} agentProxyBaseFee={agentProxyBaseFee} />
      ) : (
        <SettlementTab periods={periods} filter={filter} lines={lines} />
      )}
    </div>
  );
}

export function TabLink({ label, active, href }: { label: string; active: boolean; href: string }) {
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
// 날짜 구간의 설치 완료(승인된) 건 → 총합계 → 기사별 → 건별.
function SettlementTab({
  periods,
  filter,
  lines,
}: {
  periods: SettlementPeriodView[];
  filter: Filter;
  lines: InstallSettlementLineView[];
}) {
  const router = useRouter();
  const [fStart, setFStart] = useState(filter.startDate);
  const [fEnd, setFEnd] = useState(filter.endDate);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const period = filter.periodId ? periods.find((p) => p.id === filter.periodId) : undefined;

  const groups = useMemo<InstallerGroup[]>(() => {
    const map = new Map<string, InstallerGroup>();
    for (const l of lines) {
      let g = map.get(l.installerId);
      if (!g) {
        g = { installerId: l.installerId, installerName: l.installerName, count: 0, totalAmount: 0, lines: [] };
        map.set(l.installerId, g);
      }
      g.count += 1;
      g.totalAmount += l.totalAmount;
      g.lines.push(l);
    }
    for (const g of map.values()) g.lines.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [lines]);

  const grandTotal = groups.reduce((s, g) => s + g.totalAmount, 0);
  // 야간/휴일 할증은 폐지됐다. 폐지 전 건이 섞인 조회에만 열을 남긴다.
  const hasNightWeekend = lines.some((l) => l.nightWeekendFee > 0);

  function search() {
    const params = new URLSearchParams({ tab: "settlement" });
    if (fStart) params.set("startDate", fStart);
    if (fEnd) params.set("endDate", fEnd);
    router.push(`/backoffice/installers-settlement?${params.toString()}`);
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.installerId));

  const exportParams = new URLSearchParams({ sourceType: "INSTALL" });
  if (filter.periodId) exportParams.set("periodId", filter.periodId);
  if (filter.startDate) exportParams.set("startDate", filter.startDate);
  if (filter.endDate) exportParams.set("endDate", filter.endDate);

  return (
    <div className="space-y-6">
      {/* 조회 조건 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Labeled label="설치 완료일 (시작)">
              <input type="date" className={inputCls} value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </Labeled>
            <Labeled label="설치 완료일 (끝)">
              <input type="date" className={inputCls} value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </Labeled>
            <button className={primaryBtn} onClick={search} disabled={!fStart || !fEnd || fStart > fEnd}>
              조회
            </button>
          </div>
          <a className={secondaryBtn} href={`/api/settlement/export?${exportParams.toString()}`}>
            엑셀 내보내기
          </a>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          본사 승인이 끝난 설치 건만 금액이 잡힙니다. A/S 건은 포함하지 않습니다.
        </p>
        {period ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            정산 주기: {period.name} ({period.startDate} ~ {period.endDate})
            <Link className="text-amber-900 underline" href="/backoffice/installers-settlement?tab=settlement">
              해제
            </Link>
          </div>
        ) : null}
      </section>

      {/* 1단계: 총합계 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <BigStat label="총 정산 금액" value={won(grandTotal)} strong />
        <BigStat label="설치 건수" value={`${lines.length.toLocaleString()}건`} />
        <BigStat label="기사 수" value={`${groups.length}명`} />
      </section>

      {/* 2단계: 기사별 → 3단계: 건별 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-700">기사별 금액</h2>
          {groups.length > 0 ? (
            <button
              className={linkBtn}
              onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.installerId)))}
            >
              {allOpen ? "모두 접기" : "모두 펼치기"}
            </button>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">이 기간에 승인된 설치 건이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500">
                  <th className="py-2">기사</th>
                  <th className="text-right">건수</th>
                  <th className="text-right">금액</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isOpen = open.has(g.installerId);
                  return (
                    <Fragment key={g.installerId}>
                      <tr
                        className="cursor-pointer border-b hover:bg-zinc-50"
                        onClick={() => toggle(g.installerId)}
                      >
                        <td className="py-2.5 font-semibold">
                          <span className="mr-2 inline-block w-3 text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                          {g.installerName}
                        </td>
                        <td className="text-right">{g.count}건</td>
                        <td className="text-right font-bold">{won(g.totalAmount)}</td>
                        <td className="text-right text-xs text-blue-600">{isOpen ? "접기" : "건별 보기"}</td>
                      </tr>
                      {isOpen ? (
                        <tr className="border-b bg-zinc-50">
                          <td colSpan={4} className="px-2 py-3">
                            <InstallerLines lines={g.lines} hasNightWeekend={hasNightWeekend} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-sm">
                  <td className="pt-3 font-bold">합계</td>
                  <td className="pt-3 text-right font-bold">{lines.length}건</td>
                  <td className="pt-3 text-right font-bold">{won(grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <PeriodsSection periods={periods} />
    </div>
  );
}

function InstallerLines({
  lines,
  hasNightWeekend,
}: {
  lines: InstallSettlementLineView[];
  hasNightWeekend: boolean;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="py-1.5">완료일</th>
          <th>주문번호</th>
          <th>고객</th>
          <th>주소</th>
          <th className="text-right">연동비</th>
          <th className="text-right">출장비</th>
          <th className="text-right">장거리</th>
          {hasNightWeekend ? <th className="text-right">야간/휴일</th> : null}
          <th className="text-right">기타 청구</th>
          <th className="text-right">월패드(본사)</th>
          <th className="text-right">금액</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-t border-zinc-200">
            <td className="whitespace-nowrap py-1.5">{kstDate(l.completedAt)}</td>
            <td className="whitespace-nowrap">
              <a
                className="text-blue-600 hover:underline"
                href={`/backoffice/installations/${l.sourceOrderId}`}
                onClick={(e) => e.stopPropagation()}
              >
                {l.erpOrderNo || l.sourceOrderId.slice(0, 8)}
              </a>
              {l.agentProxy ? (
                <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">대행</span>
              ) : null}
            </td>
            <td className="whitespace-nowrap">{l.customerName ?? "-"}</td>
            <td className="max-w-[16rem] truncate" title={l.address ?? ""}>
              {l.address ?? "-"}
            </td>
            <td className="text-right">{num(l.linkageFee)}</td>
            <td className="text-right">{num(l.travelFee)}</td>
            <td className="text-right">{num(l.longDistanceFee)}</td>
            {hasNightWeekend ? <td className="text-right">{num(l.nightWeekendFee)}</td> : null}
            <td className="text-right">{num(l.extraClaimFee)}</td>
            <td className="text-right">{num(l.wallpadFee)}</td>
            <td className="text-right font-bold">{won(l.totalAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const num = (n: number) => (n === 0 ? "-" : n.toLocaleString());

// ── 정산 주기 (예전 방식, 접어 둠) ─────────────────────────────────────
function PeriodsSection({ periods }: { periods: SettlementPeriodView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "실패");
      else router.refresh();
    });
  }

  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-zinc-500">
        정산 주기 관리 (결산 확정용 · 선택 사항)
      </summary>
      <div className="mt-4 space-y-4">
        {error ? <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
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
                        <button className={linkBtn} disabled={pending} onClick={() => run(() => collectLinesIntoPeriodAction(p.id))}>
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
      </div>
    </details>
  );
}

function BigStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${strong ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white"}`}>
      <div className={`text-xs ${strong ? "text-zinc-300" : "text-zinc-500"}`}>{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

// ── Rates tab ─────────────────────────────────────────────────────────
function RatesTab({
  rateDefaults,
  rateOverrides,
  agentProxyBaseFee,
}: {
  rateDefaults: EffectiveRates;
  rateOverrides: InstallerRateOverrideView[];
  agentProxyBaseFee: number;
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
          <Stat label="총판 대행 기본 출장비" value={won(agentProxyBaseFee)} />
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
        // 야간/휴일 할증은 폐지되어 입력란이 없다. 폐지 전에 제출된 건이 아직
        // 이 값을 쓰므로 저장할 때 지우지 않고 그대로 둔다.
        nightSurcharge: row.nightSurcharge,
        weekendSurcharge: row.weekendSurcharge,
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
const secondaryBtn = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50";
