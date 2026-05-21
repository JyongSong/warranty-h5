"use client";

import { useState } from "react";

type DispatchAssignment = {
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  order_numbers: string | null;
  memo: string | null;
  due_date: string | null;
  business_number: string;
  branch_name: string;
  item_code: string | null;
  item_name: string | null;
  quantity: number | null;
};

function todayKST(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

const stripDash = (d: string) => d.replace(/-/g, "");
const formatYmd = (yyyymmdd: string | null | undefined) =>
  yyyymmdd ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : "";

export default function DispatchClient() {
  const today = todayKST();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState<DispatchAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const isValidRange = dateFrom && dateTo && dateFrom <= dateTo;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = `from=${stripDash(dateFrom)}&to=${stripDash(dateTo)}`;
      const res = await fetch(`/api/dispatch?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ERP 조회 실패");
      setRows(json.data);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    const qs = `from=${stripDash(dateFrom)}&to=${stripDash(dateTo)}`;
    window.location.href = `/api/dispatch/export?${qs}`;
  };

  const branchStats = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.branch_name] = (acc[r.branch_name] ?? 0) + 1;
    return acc;
  }, {});
  const branchEntries = Object.entries(branchStats).sort((a, b) => b[1] - a[1]);
  const unmatchedItems = rows.filter((r) => !r.item_code).length;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f1ea_0%,#fbfaf8_55%,#ffffff_100%)] text-zinc-900">
      <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">기사배정</h1>
          <p className="text-sm text-zinc-500 mt-1">
            납기일자 기준 출장/설치 대상 자동 분배 및 Excel 다운로드
          </p>
        </div>

        <div className="bg-white rounded-xl border border-black/10 p-4 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              납기일자 (시작)
            </label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900"
            />
          </div>
          <div className="text-zinc-400 pb-2">~</div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              납기일자 (종료)
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading || !isValidRange}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "조회 중…" : "조회"}
          </button>
          {searched && rows.length > 0 && (
            <button
              onClick={downloadExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              📥 Excel 다운로드 ({rows.length}건)
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
            ERP 연결 오류: {error}
          </div>
        )}

        {searched && rows.length > 0 && (
          <div className="bg-white rounded-xl border border-black/10 p-4 mb-6">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-zinc-500 mr-2">지점별 배정:</span>
              {branchEntries.map(([branch, count]) => (
                <span
                  key={branch}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                >
                  {branch} <span className="font-semibold">×{count}</span>
                </span>
              ))}
              {unmatchedItems > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded-full ml-2">
                  ⚠ 품목 미인식 ×{unmatchedItems}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-black/10">
          {!searched ? (
            <div className="px-6 py-12 text-center text-zinc-400 text-sm">
              납기일자 범위를 선택하고 조회 버튼을 눌러주세요.
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-400 text-sm">
              해당 기간에 기사배정 대상 주문이 없습니다.
            </div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-100 text-xs font-medium text-zinc-500">
                      <th className="px-3 py-3 text-left">납기일자</th>
                      <th className="px-3 py-3 text-left">지점</th>
                      <th className="px-3 py-3 text-left">고객명</th>
                      <th className="px-3 py-3 text-left">연락처</th>
                      <th className="px-3 py-3 text-left">주소</th>
                      <th className="px-3 py-3 text-left">품목</th>
                      <th className="px-3 py-3 text-right">수량</th>
                      <th className="px-3 py-3 text-left">주문번호 / 메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-50 hover:bg-zinc-50 text-sm"
                      >
                        <td className="px-3 py-3 text-zinc-500 text-xs whitespace-nowrap">
                          {formatYmd(r.due_date)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="text-zinc-900 font-medium">{r.branch_name}</div>
                          <div className="text-zinc-400 text-xs font-mono">
                            {r.business_number}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-zinc-900 font-medium whitespace-nowrap">
                          {r.customer_name || <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-zinc-700 font-mono whitespace-nowrap">
                          {r.phone || <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-zinc-700 text-xs leading-relaxed">
                          {r.address || <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {r.item_code ? (
                            <>
                              <div className="text-zinc-900">{r.item_name}</div>
                              <div className="text-zinc-400 text-xs font-mono">
                                {r.item_code}
                              </div>
                            </>
                          ) : (
                            <span className="text-orange-500 text-xs">⚠ 미인식</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-zinc-900 whitespace-nowrap">
                          {r.quantity ?? <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.order_numbers && (
                            <div className="text-blue-600 font-mono mb-1">
                              {r.order_numbers}
                            </div>
                          )}
                          {r.memo && <div className="text-zinc-500">{r.memo}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-zinc-100">
                {rows.map((r, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {r.customer_name}
                        </p>
                        <p className="text-xs text-blue-700">📍 {r.branch_name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-zinc-500 block">
                          {r.phone}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {formatYmd(r.due_date)}
                        </span>
                      </div>
                    </div>
                    {r.address && (
                      <p className="text-xs text-zinc-500 mb-1">🏠 {r.address}</p>
                    )}
                    {r.item_name && (
                      <p className="text-xs text-zinc-700 mb-1">
                        🔧 {r.item_name}{" "}
                        <span className="text-zinc-400">×{r.quantity ?? "?"}</span>
                      </p>
                    )}
                    {r.order_numbers && (
                      <p className="text-xs text-blue-600 font-mono mb-1">
                        {r.order_numbers}
                      </p>
                    )}
                    {r.memo && <p className="text-xs text-zinc-500 mt-1">📦 {r.memo}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
