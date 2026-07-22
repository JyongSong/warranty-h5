/* eslint-disable react-hooks/set-state-in-effect */
"use client";


import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AuthAdmin } from "@/lib/adminAuth";
import { formatKrPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";

type SurveyItem = {
  id: string;
  q1_1: string;
  q1_2: string;
  q1_3: string;
  q2_1: string;
  q2_2: string;
  q2_3: string;
  q3_1: number;
  comment: string | null;
  createdAt: string;
};

type RegistrationItem = {
  id: string;
  sn: string;
  installType: string;
  installDate: string;
  userPhone: string;
  installerPhone: string | null;
  status: string;
  freeAsEndDate: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
  surveyStatus: "NONE" | "WAITING" | "READY" | "SENT" | "COMPLETED";
  survey: SurveyItem | null;
  surveySentAt: string | null;
  installerName?: string | null;
  installerBranch?: string | null;
};

function installTypeLabel(type: string) {
  if (type === "self") return "자가 설치";
  if (type === "external") return "외부 기사";
  return "기사 설치";
}

function statusLabel(status: string) {
  if (status === "confirmed") return "확인 완료";
  if (status === "submitted") return "확인 대기";
  if (status === "void") return "무효";
  return status;
}

function statusStyle(status: string): string {
  if (status === "confirmed") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (status === "submitted") return "bg-amber-50 text-amber-700 border border-amber-200";
  if (status === "void") return "bg-zinc-100 text-zinc-600 border border-zinc-200";
  return "bg-zinc-100 text-zinc-700 border border-zinc-200";
}

function surveyStatusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "발송 및 참여 완료";
    case "SENT":
      return "발송 완료 (미참여)";
    case "READY":
      return "발송 대기";
    case "WAITING":
      return "7영업일 대기 중";
    default:
      return "대상 아님";
  }
}

function surveyStatusStyle(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "SENT":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "READY":
      return "bg-orange-50 text-orange-700 border border-orange-200";
    case "WAITING":
      return "bg-amber-50 text-amber-600 border border-amber-200";
    default:
      return "bg-zinc-100 text-zinc-500 border border-zinc-200";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

const SURVEY_QUESTIONS: Record<string, string> = {
  q1_1: "설치 기사님은 약속 시간을 지켜 방문하셨나요?",
  q1_2: "설치 서비스 품질에 만족하시나요?",
  q1_3: "제품 사용법 및 주의사항에 대해 자세한 안내를 받으셨나요?",
  q2_1: "Aqara Home 앱 설치 및 연결 과정이 편리하셨나요?",
  q2_2: "앱의 회원 가입 및 장치 추가 단계가 순조로웠나요?",
  q2_3: "현재 앱을 사용하는 전반적인 만족도는 어떠신가요?",
};

export default function RegistrationsClient({ admin }: { admin: AuthAdmin }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"query" | "survey">(
    tabParam === "survey" ? "survey" : "query"
  );

  useEffect(() => {
    if (tabParam === "survey" && activeTab !== "survey") {
      setActiveTab("survey");
    } else if (tabParam === "query" && activeTab !== "query") {
      setActiveTab("query");
    }
  }, [tabParam, activeTab]);
  const [query, setQuery] = useState("");
  const [surveyFilter, setSurveyFilter] = useState<string>("ALL");
  const [ratingFilter, setRatingFilter] = useState<number | "ALL">("ALL");
  const [selectedSurveyIds, setSelectedSurveyIds] = useState<string[]>([]);
  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sendingSurvey, setSendingSurvey] = useState(false);

  // Reset states when filters/tabs change
  useEffect(() => {
    if (selectedSurveyIds.length > 0) {
      setSelectedSurveyIds([]);
    }
    if (surveyFilter !== "COMPLETED" && ratingFilter !== "ALL") {
      setRatingFilter("ALL");
    }
  }, [surveyFilter, activeTab, query, selectedSurveyIds, ratingFilter]);

  async function handleSendSurvey(registrationId: string) {
    if (sendingSurvey) return;
    setSendingSurvey(true);
    try {
      const r = await fetch("/api/admin/send-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.error ?? "설문 발송에 실패했습니다.");
      }
      alert("만족도 조사 설문 링크가 성공적으로 발송되었습니다.");
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      alert(getErrorMessage(err, "설문 발송에 실패했습니다."));
    } finally {
      setSendingSurvey(false);
    }
  }

  async function handleBatchSendSurvey() {
    if (sendingSurvey || selectedSurveyIds.length === 0) return;
    if (
      !confirm(
        `선택한 ${selectedSurveyIds.length}명의 고객에게 만족도 조사 설문 링크를 일괄 발송하시겠습니까?`
      )
    ) {
      return;
    }
    setSendingSurvey(true);
    try {
      const r = await fetch("/api/admin/send-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationIds: selectedSurveyIds }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.error ?? "설문 일괄 발송에 실패했습니다.");
      }
      alert(`성공적으로 ${data.sentCount}건의 설문 링크가 발송되었습니다.`);
      setSelectedSurveyIds([]);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      alert(getErrorMessage(err, "설문 일괄 발송에 실패했습니다."));
    } finally {
      setSendingSurvey(false);
    }
  }

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const r = await fetch(`/api/registrations?query=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });
        const data = await r.json().catch(() => ({ items: [] }));

        if (!r.ok) {
          throw new Error(data?.error ?? "설치 정보를 불러오지 못했습니다.");
        }

        if (cancelled) return;

        const nextItems: RegistrationItem[] = Array.isArray(data?.items) ? data.items : [];
        setItems(nextItems);

        if (!nextItems.some((item) => item.id === selectedId)) {
          setSelectedId(nextItems[0]?.id ?? null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(err, "설치 정보를 불러오지 못했습니다."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const timer = window.setTimeout(load, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedId, refreshTrigger]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/auth";
  }

  function handleExportExcel() {
    window.location.href = `/api/registrations/export?query=${encodeURIComponent(query)}`;
  }

  // Calculate stats for Dashboard
  const stats = useMemo(() => {
    const installerItems = items.filter(
      (item) => item.installType === "installer" && item.status === "confirmed"
    );
    const waiting = installerItems.filter((item) => item.surveyStatus === "WAITING").length;
    const ready = installerItems.filter((item) => item.surveyStatus === "READY").length;
    const sent = installerItems.filter((item) => item.surveyStatus === "SENT").length;
    const completed = installerItems.filter((item) => item.surveyStatus === "COMPLETED").length;
    const totalSent = sent + completed;
    const responseRate = totalSent > 0 ? Math.round((completed / totalSent) * 100) : 0;

    return {
      total: installerItems.length,
      waiting,
      ready,
      sent: totalSent,
      completed,
      responseRate,
    };
  }, [items]);

  // Filter items for Survey Dashboard
  const filteredSurveyItems = useMemo(() => {
    let candidates = items.filter(
      (item) => item.installType === "installer" && item.status === "confirmed"
    );
    if (surveyFilter !== "ALL") {
      candidates = candidates.filter((item) => item.surveyStatus === surveyFilter);
    }
    if (surveyFilter === "COMPLETED" && ratingFilter !== "ALL") {
      candidates = candidates.filter((item) => item.survey?.q3_1 === ratingFilter);
    }
    return candidates;
  }, [items, surveyFilter, ratingFilter]);

  function renderStars(rating: number) {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`h-5 w-5 ${
              star <= rating ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200"
            }`}
            viewBox="0 0 24 24"
          >
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        ))}
        <span className="ml-2 text-sm font-bold text-zinc-700">{rating} / 5</span>
      </div>
    );
  }

  function renderChoiceBadge(val: string) {
    if (val === "예") {
      return (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
          예
        </span>
      );
    }
    if (val === "아니오") {
      return (
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
          아니오
        </span>
      );
    }
    return (
      <span className="rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-500 border border-zinc-200">
        잘 모르겠어요
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/70 text-zinc-900 font-sans">
      {/* Sticky Premium Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-950">설치 및 품질보증 관리</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Tab Selector */}
        <div className="mb-8 flex border-b border-zinc-200 items-center justify-between">
          <div className="flex">
            {activeTab === "query" ? (
              <div className="px-5 py-3 font-semibold text-sm -mb-px border-b-2 border-emerald-800 text-emerald-800">
                설치 정보 조회 (기존)
              </div>
            ) : (
              <div className="px-5 py-3 font-semibold text-sm -mb-px border-b-2 border-emerald-800 text-emerald-800">
                만족도 조사 대시보드
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 active:scale-95 flex items-center gap-1.5 shadow-sm -mb-px"
          >
            <svg
              className="h-4 w-4 text-emerald-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            엑셀 다운로드 (导出 Excel)
          </button>
        </div>

        {/* Tab 1: Installation Query */}
        {activeTab === "query" && (
          <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
            {/* Sidebar list */}
            <aside className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  검색 필터
                </label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="SN, 고객/기사 전화번호, 상태 검색"
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 outline-none transition focus:border-emerald-800 focus:bg-white"
                />
              </div>

              <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                <span>{loading ? "조회 중..." : `총 ${items.length}건`}</span>
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="font-semibold text-emerald-800 hover:underline"
                  >
                    초기화
                  </button>
                )}
              </div>

              {error && (
                <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {items.map((item) => {
                  const active = item.id === selectedItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-emerald-800 bg-emerald-900 text-white shadow-md shadow-emerald-900/10"
                          : "border-zinc-200 bg-white hover:border-zinc-300"
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="font-bold text-sm tracking-tight">{item.sn}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            active
                              ? "bg-white/20 text-white border border-white/10"
                              : statusStyle(item.status)
                          }`}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <div className={`text-xs ${active ? "text-white/80" : "text-zinc-500"}`}>
                        고객: {formatKrPhone(item.userPhone)}
                      </div>
                      <div
                        className={`mt-1 text-[11px] ${active ? "text-white/60" : "text-zinc-400"}`}
                      >
                        {installTypeLabel(item.installType)} | 설치 {item.installDate}
                      </div>
                    </button>
                  );
                })}

                {!loading && items.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-12 text-center text-sm text-zinc-400">
                    조회 결과가 없습니다.
                  </div>
                )}
              </div>
            </aside>

            {/* Detail View */}
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              {selectedItem ? (
                <div className="space-y-6">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      REGISTRATION DETAILS
                    </span>
                    <h2 className="text-2xl font-bold text-zinc-950 mt-1">{selectedItem.sn}</h2>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InfoCard label="설치 유형" value={installTypeLabel(selectedItem.installType)} />
                    <InfoCard label="상태" value={statusLabel(selectedItem.status)} />
                    <InfoCard label="설치일" value={selectedItem.installDate} />
                    <InfoCard
                      label="무상 A/S 종료일"
                      value={selectedItem.freeAsEndDate ?? "-"}
                      highlight={!!selectedItem.freeAsEndDate}
                    />
                    <InfoCard label="고객 전화번호" value={formatKrPhone(selectedItem.userPhone)} />
                    <InfoCard
                      label="기사 전화번호"
                      value={
                        selectedItem.installerPhone ? formatKrPhone(selectedItem.installerPhone) : "-"
                      }
                    />
                    <InfoCard
                      label="기사 성명"
                      value={selectedItem.installerName ?? "-"}
                    />
                    <InfoCard
                      label="소속 지사"
                      value={selectedItem.installerBranch ?? "-"}
                    />
                    <InfoCard label="접수 시각" value={formatDateTime(selectedItem.submittedAt)} />
                    <InfoCard label="확인 완료 시각" value={formatDateTime(selectedItem.confirmedAt)} />
                    <InfoCard label="확인 주체" value={selectedItem.confirmedBy ?? "-"} />
                    <InfoCard label="최종 수정" value={formatDateTime(selectedItem.updatedAt)} />
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-500 leading-relaxed">
                    <p className="font-bold mb-1 text-zinc-700">검색 가이드</p>
                    <p>
                      기본 목록에서 시리얼 번호(SN)나 상태값을 검색할 수 있습니다. 상태값 필터 예시:{" "}
                      <code className="rounded bg-zinc-200 px-1 py-0.5">submitted</code> (대기),{" "}
                      <code className="rounded bg-zinc-200 px-1 py-0.5">confirmed</code> (확정),{" "}
                      <code className="rounded bg-zinc-200 px-1 py-0.5">installer</code> (기사설치).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-200 text-zinc-400">
                  선택된 내역이 없습니다. 왼쪽 리스트에서 시리얼을 선택해 주세요.
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 2: Survey Dashboard */}
        {activeTab === "survey" && (
          <div className="space-y-8">
            {/* Survey Metrics Panel */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard title="총 설문 대상" value={stats.total} description="기사 확정 건수" />
              <MetricCard
                title="7영업일 대기"
                value={stats.waiting}
                description="아직 발송일 미도달"
                type="warning"
              />
              <MetricCard
                title="발송 대기"
                value={stats.ready}
                description="오늘 전송 예정"
                type="info"
              />
              <MetricCard title="알림톡 발송 완료" value={stats.sent} description="고객 전송 완료" />
              <MetricCard
                title="설문 응답 완료"
                value={stats.completed}
                description={`참여율: ${stats.responseRate}%`}
                type="success"
              />
            </section>

            {/* List and survey feedback view */}
            <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
              {/* Sidebar candidates list */}
              <aside className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    설문 상태 필터
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key: "ALL", label: "전체" },
                      { key: "COMPLETED", label: "참여 완료" },
                      { key: "SENT", label: "미참여" },
                      { key: "READY", label: "발송 대기" },
                      { key: "WAITING", label: "대기 중" },
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setSurveyFilter(f.key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          surveyFilter === f.key
                            ? "bg-emerald-800 text-white"
                            : "bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {surveyFilter === "COMPLETED" && (
                  <div className="mb-4 border-t border-zinc-100 pt-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      평점 필터
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: "ALL", label: "전체" },
                        { key: 5, label: "5점" },
                        { key: 4, label: "4점" },
                        { key: 3, label: "3점" },
                        { key: 2, label: "2점" },
                        { key: 1, label: "1점" },
                      ].map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => setRatingFilter(r.key as number | "ALL")}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 transition ${
                            ratingFilter === r.key
                              ? "bg-amber-500 text-white"
                              : "bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                          }`}
                        >
                          {r.label}
                          {typeof r.key === "number" && (
                            <svg
                              className={`h-3 w-3 ${
                                ratingFilter === r.key
                                  ? "fill-white text-white"
                                  : "fill-amber-400 text-amber-400"
                              }`}
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {surveyFilter === "READY" && selectedSurveyIds.length > 0 && (
                  <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 flex flex-col gap-2.5 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">
                        {selectedSurveyIds.length}개 선택됨
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedSurveyIds([])}
                        className="text-[11px] font-semibold text-emerald-800 hover:underline"
                      >
                        선택 해제
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={sendingSurvey}
                      onClick={handleBatchSendSurvey}
                      className="w-full h-10 rounded-xl bg-emerald-800 text-white font-bold text-xs hover:bg-emerald-900 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-1.5"
                    >
                      {sendingSurvey ? (
                        "발송 중..."
                      ) : (
                        <>
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          선택한 설문 일괄 발송
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="mb-3 flex items-center justify-between text-xs text-zinc-500 font-semibold">
                  <span>검색 결과: {filteredSurveyItems.length}건</span>
                  {surveyFilter === "READY" && filteredSurveyItems.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-800 transition">
                      <input
                        type="checkbox"
                        checked={
                          selectedSurveyIds.length === filteredSurveyItems.length &&
                          filteredSurveyItems.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSurveyIds(filteredSurveyItems.map((item) => item.id));
                          } else {
                            setSelectedSurveyIds([]);
                          }
                        }}
                        className="rounded border-zinc-300 text-emerald-800 focus:ring-emerald-800 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>전체 선택</span>
                    </label>
                  )}
                </div>

                <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                  {filteredSurveyItems.map((item) => {
                    const active = item.id === selectedId;
                    const isChecked = selectedSurveyIds.includes(item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        {surveyFilter === "READY" && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSurveyIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedSurveyIds((prev) => prev.filter((id) => id !== item.id));
                              }
                            }}
                            className="rounded border-zinc-300 text-emerald-800 focus:ring-emerald-800 h-4.5 w-4.5 shrink-0 cursor-pointer ml-1"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={`flex-1 rounded-2xl border p-4 text-left transition ${
                            active
                              ? "border-emerald-800 bg-emerald-900 text-white shadow-md shadow-emerald-900/10"
                              : "border-zinc-200 bg-white hover:border-zinc-300"
                          }`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="font-bold text-sm">{item.sn}</div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                active
                                  ? "bg-white/20 text-white border border-white/10"
                                  : surveyStatusStyle(item.surveyStatus)
                              }`}
                            >
                              {surveyStatusLabel(item.surveyStatus)}
                            </span>
                          </div>
                          <div className={`text-xs ${active ? "text-white/80" : "text-zinc-600"}`}>
                            고객: {formatKrPhone(item.userPhone)}
                          </div>
                          <div
                            className={`mt-1 text-[11px] ${
                              active ? "text-white/60" : "text-zinc-400"
                            }`}
                          >
                            설치일: {item.installDate} | 확정일: {item.confirmedAt ? item.confirmedAt.slice(0, 10) : "-"}
                          </div>
                        </button>
                      </div>
                    );
                  })}

                  {filteredSurveyItems.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-12 text-center text-sm text-zinc-400">
                      해당 조건의 설문 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </aside>

              {/* Survey feedback detail viewer */}
              <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                {selectedItem ? (
                  <div className="space-y-6">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        SATISFACTION SURVEY FEEDBACK
                      </span>
                      <h2 className="text-2xl font-bold text-zinc-950 mt-1">{selectedItem.sn}</h2>
                      <p className="text-xs text-zinc-500 mt-1">
                        고객 연락처: {formatKrPhone(selectedItem.userPhone)} | 설치 확인:{" "}
                        {formatDateTime(selectedItem.confirmedAt)}
                      </p>
                      {selectedItem.installerPhone && (
                        <p className="text-xs text-zinc-600 mt-2 bg-zinc-50 border border-zinc-200/60 rounded-lg px-3 py-2 inline-flex items-center gap-1.5 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-700"></span>
                          담당 설치 기사: {selectedItem.installerName ?? "미등록"} {selectedItem.installerBranch ? `(${selectedItem.installerBranch})` : ""} | {formatKrPhone(selectedItem.installerPhone)}
                        </p>
                      )}
                    </div>

                    {/* Conditional rendering depending on surveyStatus */}
                    {selectedItem.surveyStatus === "COMPLETED" && selectedItem.survey ? (
                      <div className="space-y-6">
                        {/* Overall Rating Score Card */}
                        <div className="rounded-2xl bg-amber-50/50 border border-amber-200/50 p-5">
                          <h3 className="text-sm font-bold text-zinc-800 mb-2">스마트 도어락 종합 만족도</h3>
                          {renderStars(selectedItem.survey.q3_1)}
                          <p className="text-xs text-zinc-400 mt-2">
                            제출 시각: {formatDateTime(selectedItem.survey.createdAt)}
                          </p>
                        </div>

                        {/* Checklist Details */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold text-zinc-800 border-b border-zinc-100 pb-2">
                            상세 설문 답변
                          </h3>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {Object.entries(SURVEY_QUESTIONS).map(([key, label]) => {
                              const answer = selectedItem.survey
                                ? (selectedItem.survey[key as keyof SurveyItem] as string)
                                : "-";
                              return (
                                <div
                                  key={key}
                                  className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4.5 flex flex-col justify-between gap-3"
                                >
                                  <span className="text-xs text-zinc-600 font-medium leading-relaxed">
                                    {label}
                                  </span>
                                  <div className="flex justify-end">
                                    {renderChoiceBadge(answer)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Subjective Comments */}
                        {selectedItem.survey.comment ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                            <h3 className="text-sm font-bold text-zinc-800 mb-2">
                              기타 고객 건의 및 의견
                            </h3>
                            <blockquote className="border-l-4 border-emerald-800 pl-4 text-sm italic text-zinc-700 leading-relaxed font-serif my-2 bg-white/50 p-3 rounded-r-xl">
                              &ldquo;{selectedItem.survey.comment}&rdquo;
                            </blockquote>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400">
                            작성된 주관식 의견이 없습니다.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-8 text-center text-zinc-500 space-y-4">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                          {selectedItem.surveyStatus === "SENT" ? (
                            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M12 6v6l4 2"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-zinc-800">
                            {selectedItem.surveyStatus === "SENT"
                              ? "설문 알림톡 전송 완료"
                              : selectedItem.surveyStatus === "READY"
                              ? "설문 발송 대기 중"
                              : "7영업일 미달 대기 중"}
                          </h3>
                          <p className="text-xs text-zinc-400 mt-1">
                            {selectedItem.surveyStatus === "SENT"
                              ? `알림 발송일: ${formatDateTime(selectedItem.surveySentAt)}`
                              : `설치 확정일: ${formatDateTime(selectedItem.confirmedAt)}`}
                          </p>
                        </div>
                        <p className="max-w-md mx-auto text-xs text-zinc-500 leading-relaxed">
                          {selectedItem.surveyStatus === "SENT"
                            ? "고객에게 카카오 알림톡/SMS를 통해 만족도 조사 전용 링크가 전송되었습니다. 고객이 설문에 참여하면 여기에 실시간으로 평점과 응답 피드백이 표시됩니다."
                            : selectedItem.surveyStatus === "READY"
                            ? "설치 확정 후 7영업일이 경과하여 발송 대기 중인 상태입니다. 매일 오전 10시 30분 시스템 스케줄러(Cron)가 돌 때 자동으로 발송 링크가 나갑니다."
                            : "설치 확인 완료 후 영업일 기준 7일이 경과해야 설문조사 링크가 자동으로 발송됩니다. 주말 및 국가 공휴일은 발송 대기 일수 계산에서 자동 제외됩니다."}
                        </p>
                        {(selectedItem.surveyStatus === "READY" || selectedItem.surveyStatus === "SENT") && (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleSendSurvey(selectedItem.id)}
                              disabled={sendingSurvey}
                              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                              {sendingSurvey
                                ? "발송 중..."
                                : selectedItem.surveyStatus === "SENT"
                                ? "설문 링크 재발송 (重新发送)"
                                : "설문 링크 발송 (发送问卷)"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-200 text-zinc-400">
                    선택된 항목이 없습니다. 대시보드 리스트에서 시리얼 번호를 선택해 주세요.
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function InfoCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white px-5 py-4 transition hover:shadow-sm ${highlight ? "ring-2 ring-emerald-800/10" : ""}`}>
      <div className="mb-1 text-xs text-zinc-400 font-semibold">{label}</div>
      <div className={`text-base font-bold ${highlight ? "text-emerald-800" : "text-zinc-800"}`}>{value}</div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  type = "default",
}: {
  title: string;
  value: number | string;
  description: string;
  type?: "default" | "success" | "warning" | "info";
}) {
  let themeClass = "border-zinc-200 bg-white";
  let valueColor = "text-zinc-900";

  if (type === "success") {
    themeClass = "border-emerald-200 bg-emerald-50/30";
    valueColor = "text-emerald-800";
  } else if (type === "warning") {
    themeClass = "border-amber-200 bg-amber-50/20";
    valueColor = "text-amber-600";
  } else if (type === "info") {
    themeClass = "border-blue-200 bg-blue-50/20";
    valueColor = "text-blue-800";
  }

  return (
    <div className={`rounded-2xl border p-4.5 shadow-sm transition hover:shadow-md ${themeClass}`}>
      <div className="text-xs font-semibold text-zinc-500">{title}</div>
      <div className={`text-2xl font-black mt-2 tracking-tight ${valueColor}`}>{value}</div>
      <div className="text-[11px] text-zinc-400 font-medium mt-1">{description}</div>
    </div>
  );
}
