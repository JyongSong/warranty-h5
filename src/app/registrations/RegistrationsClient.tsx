"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthAdmin } from "@/lib/adminAuth";
import { formatKrPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";

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
};

function installTypeLabel(type: string) {
  return type === "self" ? "자가 설치" : "기사 설치";
}

function statusLabel(status: string) {
  if (status === "confirmed") return "확인 완료";
  if (status === "submitted") return "확인 대기";
  if (status === "void") return "무효";
  return status;
}

function statusStyle(status: string): string {
  if (status === "confirmed") return "bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "bg-amber-50 text-amber-700";
  if (status === "void") return "bg-zinc-100 text-zinc-600";
  return "bg-zinc-100 text-zinc-700";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

export default function RegistrationsClient({ admin }: { admin: AuthAdmin }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [query, selectedId]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2f4_0%,#fafaf7_55%,#ffffff_100%)] px-4 py-8 text-zinc-900 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-black/10 bg-white/85 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Registrations</div>
              <h1 className="text-2xl font-semibold">설치 정보 조회</h1>
              <div className="mt-1 text-xs text-zinc-500">
                {admin.name} / 권한 등급 {admin.level}
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              로그아웃
            </button>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SN, 고객 전화, 기사 전화, 상태 검색"
            className="mb-4 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 outline-none transition focus:border-zinc-400"
          />

          <div className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-500">
            <span>{loading ? "불러오는 중..." : `${items.length}건`}</span>
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600"
              >
                검색 초기화
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
            {items.map((item) => {
              const active = item.id === selectedItem?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-[#173045] bg-[#173045] text-white"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-semibold">{item.sn}</div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        active ? "bg-white/15 text-white" : statusStyle(item.status)
                      }`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className={`text-sm ${active ? "text-white/75" : "text-zinc-500"}`}>
                    고객 {formatKrPhone(item.userPhone)}
                  </div>
                  <div className={`text-xs ${active ? "text-white/65" : "text-zinc-500"}`}>
                    {installTypeLabel(item.installType)} / 설치일 {item.installDate}
                  </div>
                </button>
              );
            })}

            {!loading && items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
                조회 결과가 없습니다.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="rounded-[2rem] border border-black/10 bg-white/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          {selectedItem ? (
            <div className="grid gap-6">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Detail</div>
                <h2 className="text-3xl font-semibold">{selectedItem.sn}</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoCard label="설치 유형" value={installTypeLabel(selectedItem.installType)} />
                <InfoCard label="상태" value={statusLabel(selectedItem.status)} />
                <InfoCard label="설치일" value={selectedItem.installDate} />
                <InfoCard label="무상 A/S 종료일" value={selectedItem.freeAsEndDate ?? "-"} />
                <InfoCard label="고객 전화번호" value={formatKrPhone(selectedItem.userPhone)} />
                <InfoCard
                  label="기사 전화번호"
                  value={selectedItem.installerPhone ? formatKrPhone(selectedItem.installerPhone) : "-"}
                />
                <InfoCard label="접수 시각" value={formatDateTime(selectedItem.submittedAt)} />
                <InfoCard label="확인 시각" value={formatDateTime(selectedItem.confirmedAt)} />
                <InfoCard label="확인 방식" value={selectedItem.confirmedBy ?? "-"} />
                <InfoCard label="최종 수정" value={formatDateTime(selectedItem.updatedAt)} />
              </div>

              <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-5 py-4">
                <div className="mb-2 text-sm font-medium text-zinc-500">검색 팁</div>
                <div className="text-sm leading-6 text-zinc-700">
                  SN, 고객 전화번호, 기사 전화번호, 상태(`submitted`, `confirmed`) 또는 설치 유형(`installer`, `self`)으로 검색할 수 있습니다.
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-zinc-300 px-6 py-16 text-center text-zinc-500">
              조회할 설치 정보를 선택해 주세요.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-zinc-200 bg-white px-5 py-4">
      <div className="mb-1 text-sm text-zinc-500">{label}</div>
      <div className="text-base font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
