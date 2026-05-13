"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthAdmin } from "@/lib/adminAuth";
import { formatKrPhone, normalizePhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";

type InstallerItem = {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  coverage: string | null;
  address: string | null;
  category: string | null;
  ability: string | null;
  installCount: number | null;
  happyCallLt: number | null;
  defectCount: number | null;
  dissatisfactionNote: string | null;
  serviceAreas?: string[] | null;
  capabilities?: string[] | null;
  aqaraAppCapability?: string | null;
  hasAqaraHubInventory?: boolean | null;
  active?: boolean | null;
  updatedAt: string;
};

type FormState = {
  name: string;
  phone: string;
  branch: string;
  region: string;
  coverage: string;
  address: string;
  category: string;
  ability: string;
  installCount: string;
  happyCallLt: string;
  defectCount: string;
  dissatisfactionNote: string;
};

const emptyForm: FormState = {
  name: "",
  phone: "",
  branch: "",
  region: "",
  coverage: "",
  address: "",
  category: "",
  ability: "",
  installCount: "",
  happyCallLt: "",
  defectCount: "",
  dissatisfactionNote: "",
};

const STANDARD_REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const CAPABILITY_OPTIONS: { value: string; label: string }[] = [
  { value: "DOORLOCK", label: "도어락" },
  { value: "DOORBELL", label: "도어벨" },
  { value: "WALLPAD_HUB", label: "월패드 연동기" },
  { value: "OTHER", label: "기타" },
];

const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(
  CAPABILITY_OPTIONS.map((o) => [o.value, o.label]),
);

const AQARA_APP_LABEL: Record<string, string> = {
  NONE: "Aqara 앱 불가",
  DOORLOCK_AND_APP: "도어락 + 앱",
  DOORLOCK_AND_APP_AND_HUB: "도어락 + 앱 + 허브",
};

const exportHeaders = [
  "성명", "전화번호", "지점", "광역", "지역", "주소", "분류", "능력",
  "설치 가능 항목", "Aqara 앱 능력", "허브 보유",
  "설치 횟수", "Happy Call LT", "불량 횟수", "불만 사항", "수정일",
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function exportInstallersToExcel(items: InstallerItem[]) {
  const rows = items.map((item) => [
    item.name ?? "",
    formatKrPhone(item.phone ?? ""),
    item.branch ?? "",
    item.region ?? "",
    item.coverage ?? "",
    item.address ?? "",
    item.category ?? "",
    item.ability ?? "",
    (item.capabilities ?? []).map((c) => CAPABILITY_LABEL[c] ?? c).join(", "),
    AQARA_APP_LABEL[item.aqaraAppCapability ?? "NONE"] ?? "",
    item.hasAqaraHubInventory ? "보유" : "미보유",
    item.installCount == null ? "" : String(item.installCount),
    item.happyCallLt == null ? "" : String(item.happyCallLt),
    item.defectCount == null ? "" : String(item.defectCount),
    item.dissatisfactionNote ?? "",
    item.updatedAt ? item.updatedAt.replace("T", " ").slice(0, 16) : "",
  ]);

  const tableRows = [exportHeaders, ...rows]
    .map(
      (cols) =>
        `<tr>${cols.map((col) => `<td>${escapeHtml(col)}</td>`).join("")}</tr>`,
    )
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8" /></head>
      <body><table>${tableRows}</table></body>
    </html>
  `;

  const blob = new Blob(["﻿", html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `installers-${stamp}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toFormState(item: InstallerItem): FormState {
  return {
    name: item.name ?? "",
    phone: item.phone ?? "",
    branch: item.branch ?? "",
    region: item.region ?? "",
    coverage: item.coverage ?? "",
    address: item.address ?? "",
    category: item.category ?? "",
    ability: item.ability ?? "",
    installCount: item.installCount == null ? "" : String(item.installCount),
    happyCallLt: item.happyCallLt == null ? "" : String(item.happyCallLt),
    defectCount: item.defectCount == null ? "" : String(item.defectCount),
    dissatisfactionNote: item.dissatisfactionNote ?? "",
  };
}

export default function InstallersClient({ admin }: { admin: AuthAdmin }) {
  // 4 filters (3 primary + 1 free text for name/phone)
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [capabilityFilters, setCapabilityFilters] = useState<string[]>([]);

  const [items, setItems] = useState<InstallerItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageInstallers = admin.level >= 1;

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const hasAnyFilter =
    query.trim().length > 0 ||
    branchFilter.trim().length > 0 ||
    regionFilter.trim().length > 0 ||
    capabilityFilters.length > 0;

  async function loadInstallers(opts?: {
    query?: string;
    branch?: string;
    region?: string;
    capabilities?: string[];
  }) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const q = (opts?.query ?? query).trim();
      const b = (opts?.branch ?? branchFilter).trim();
      const r = (opts?.region ?? regionFilter).trim();
      const c = opts?.capabilities ?? capabilityFilters;
      if (q) params.set("query", q);
      if (b) params.set("branch", b);
      if (r) params.set("region", r);
      if (c.length > 0) params.set("capabilities", c.join(","));

      const url = `/api/installers${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({ items: [] }));

      if (!res.ok) {
        throw new Error(data?.error ?? "기사를 불러오지 못했습니다.");
      }

      const nextItems: InstallerItem[] = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);

      if (selectedId) {
        const current = nextItems.find((item) => item.id === selectedId) ?? null;
        if (current) {
          setForm(toFormState(current));
        } else {
          setSelectedId(null);
          setForm(emptyForm);
        }
      }

      return nextItems;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "기사를 불러오지 못했습니다."));
      return [] as InstallerItem[];
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadInstallers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced reload on any filter change
  useEffect(() => {
    const handle = setTimeout(() => {
      loadInstallers();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, branchFilter, regionFilter, capabilityFilters]);

  function toggleCapabilityFilter(value: string) {
    setCapabilityFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function resetFilters() {
    setQuery("");
    setBranchFilter("");
    setRegionFilter("");
    setCapabilityFilters([]);
  }

  function startCreate() {
    if (!canManageInstallers) return;
    setSelectedId(null);
    setForm(emptyForm);
    setMessage(null);
    setError(null);
  }

  function startEdit(item: InstallerItem) {
    setSelectedId(item.id);
    setForm(toFormState(item));
    setMessage(null);
    setError(null);
  }

  async function refreshAndSelect(id?: string | null) {
    const nextItems = await loadInstallers();
    if (!id) {
      setSelectedId(null);
      setForm(emptyForm);
      return;
    }
    const target = nextItems.find((item) => item.id === id) ?? null;
    if (target) {
      setSelectedId(target.id);
      setForm(toFormState(target));
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canManageInstallers) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        ...form,
        phone: normalizePhone(form.phone),
      };

      const isEdit = Boolean(selectedId);
      const url = isEdit ? `/api/installers/${selectedId}` : "/api/installers";
      const method = isEdit ? "PATCH" : "POST";

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(data?.error ?? "저장에 실패했습니다.");
      }

      const savedId = data?.item?.id ?? selectedId ?? null;
      await refreshAndSelect(savedId);
      setMessage(isEdit ? "기사 정보를 수정했습니다." : "기사를 추가했습니다.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canManageInstallers) return;
    if (!selectedId || !selectedItem) return;
    if (!window.confirm(`${selectedItem.name} 기사를 삭제할까요?`)) return;

    setDeleting(true);
    setMessage(null);
    setError(null);

    try {
      const r = await fetch(`/api/installers/${selectedId}`, { method: "DELETE" });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(data?.error ?? "삭제에 실패했습니다.");
      }

      await refreshAndSelect(null);
      setMessage("기사를 삭제했습니다.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "삭제에 실패했습니다."));
    } finally {
      setDeleting(false);
    }
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f2ede4_0%,#fbfaf7_50%,#ffffff_100%)] px-4 py-8 text-zinc-900 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-black/10 bg-white/85 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Installers</div>
              <h1 className="text-2xl font-semibold">기사 관리</h1>
              <div className="mt-1 text-xs text-zinc-500">
                {admin.name} / 권한 등급 {admin.level}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700"
              >
                로그아웃
              </button>
              <button
                type="button"
                onClick={() => exportInstallersToExcel(items)}
                disabled={items.length === 0}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-50"
              >
                Excel 내보내기
              </button>
              <button
                type="button"
                onClick={startCreate}
                disabled={!canManageInstallers}
                className="rounded-full bg-[#1d3129] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                새 기사
              </button>
            </div>
          </div>

          {!canManageInstallers ? (
            <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              현재 계정은 조회 전용입니다. 등급 1 계정만 기사 추가, 수정, 삭제가 가능합니다.
            </div>
          ) : null}

          {/* Filter panel */}
          <div className="mb-4 rounded-2xl border border-zinc-200 bg-white/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-700">검색 / 필터</div>
              {hasAnyFilter ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600"
                >
                  초기화
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              <FilterField label="이름 / 전화번호">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="홍길동 또는 010..."
                  className={filterInputClass}
                />
              </FilterField>

              <FilterField label="소속">
                <input
                  list="installer-branches"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  placeholder="예: 전국열쇠, PL 등"
                  className={filterInputClass}
                />
                <datalist id="installer-branches">
                  {[...new Set(items.map((i) => i.branch).filter(Boolean))].map((b) => (
                    <option key={b!} value={b!} />
                  ))}
                </datalist>
              </FilterField>

              <FilterField label="광역">
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className={filterInputClass}
                >
                  <option value="">전체</option>
                  {STANDARD_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="설치 가능 항목">
                <div className="flex flex-wrap gap-2">
                  {CAPABILITY_OPTIONS.map((opt) => {
                    const active = capabilityFilters.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleCapabilityFilter(opt.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-[#1d3129] text-white"
                            : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {capabilityFilters.length > 1 ? (
                  <div className="mt-2 text-xs text-zinc-500">※ 선택한 모든 항목을 갖춘 기사만 조회됩니다 (AND 조건)</div>
                ) : null}
              </FilterField>
            </div>
          </div>

          <div className="mb-3 text-sm text-zinc-500">
            {loading ? "불러오는 중..." : `${items.length}명`}
          </div>

          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {items.map((item) => {
              const active = item.id === selectedId;
              const caps = item.capabilities ?? [];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => startEdit(item)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-[#1d3129] bg-[#1d3129] text-white"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-base font-semibold">{item.name}</div>
                    {item.hasAqaraHubInventory ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          active ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"
                        }`}
                        title="Aqara 도어락용 연동기 보유"
                      >
                        허브 ✅
                      </span>
                    ) : null}
                  </div>
                  <div className={`text-sm ${active ? "text-white/75" : "text-zinc-500"}`}>
                    {formatKrPhone(item.phone)}
                  </div>
                  <div className={`mt-1 text-xs ${active ? "text-white/65" : "text-zinc-500"}`}>
                    {[item.branch, item.region].filter(Boolean).join(" / ") || "—"}
                  </div>
                  {caps.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {caps.map((c) => (
                        <span
                          key={c}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            active
                              ? "bg-white/20 text-white"
                              : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {CAPABILITY_LABEL[c] ?? c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}

            {!loading && items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
                검색 결과가 없습니다.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="rounded-[2rem] border border-black/10 bg-white/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Editor</div>
              <h2 className="text-2xl font-semibold">
                {selectedId ? "기사 정보 수정" : "기사 추가"}
              </h2>
            </div>

            {selectedId ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || !canManageInstallers}
                className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "기사 삭제"}
              </button>
            ) : null}
          </div>

          {message ? (
            <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {/* Read-only summary of structured fields (if any) */}
          {selectedItem && ((selectedItem.capabilities?.length ?? 0) > 0 ||
            (selectedItem.serviceAreas?.length ?? 0) > 0 ||
            selectedItem.aqaraAppCapability ||
            selectedItem.hasAqaraHubInventory) ? (
            <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                구조화 필드 (읽기 전용 / survey 페이지에서 수정)
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-zinc-500">설치 가능 항목: </span>
                  {(selectedItem.capabilities ?? []).length > 0
                    ? (selectedItem.capabilities ?? []).map((c) => CAPABILITY_LABEL[c] ?? c).join(", ")
                    : "—"}
                </div>
                <div>
                  <span className="text-zinc-500">Aqara 앱 능력: </span>
                  {AQARA_APP_LABEL[selectedItem.aqaraAppCapability ?? "NONE"] ?? "—"}
                </div>
                <div>
                  <span className="text-zinc-500">허브 보유: </span>
                  {selectedItem.hasAqaraHubInventory ? "✅ 보유" : "❌ 미보유"}
                </div>
                <div>
                  <span className="text-zinc-500">출장 가능 지역: </span>
                  {(selectedItem.serviceAreas ?? []).length > 0
                    ? (selectedItem.serviceAreas ?? []).join(", ")
                    : "—"}
                </div>
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="이름">
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClassName}
                  placeholder="기사명"
                />
              </Field>
              <Field label="전화번호">
                <input
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className={inputClassName}
                  placeholder="01012345678"
                />
              </Field>
              <Field label="지점">
                <input
                  value={form.branch}
                  onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="광역">
                <input
                  value={form.region}
                  onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="지역">
                <input
                  value={form.coverage}
                  onChange={(e) => setForm((prev) => ({ ...prev, coverage: e.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="분류">
                <input
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="능력">
                <input
                  value={form.ability}
                  onChange={(e) => setForm((prev) => ({ ...prev, ability: e.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="설치 횟수">
                <input
                  value={form.installCount}
                  onChange={(e) => setForm((prev) => ({ ...prev, installCount: e.target.value }))}
                  className={inputClassName}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Happy call LT">
                <input
                  value={form.happyCallLt}
                  onChange={(e) => setForm((prev) => ({ ...prev, happyCallLt: e.target.value }))}
                  className={inputClassName}
                  inputMode="numeric"
                />
              </Field>
              <Field label="불량 횟수">
                <input
                  value={form.defectCount}
                  onChange={(e) => setForm((prev) => ({ ...prev, defectCount: e.target.value }))}
                  className={inputClassName}
                  inputMode="numeric"
                />
              </Field>
            </div>

            <Field label="주소">
              <input
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                className={inputClassName}
              />
            </Field>

            <Field label="불만 사항">
              <textarea
                value={form.dissatisfactionNote}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dissatisfactionNote: e.target.value }))
                }
                className={`${inputClassName} min-h-28 resize-y py-3`}
              />
            </Field>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || !canManageInstallers}
                className="rounded-full bg-[#1d3129] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "저장 중..." : selectedId ? "기사 정보 저장" : "기사 추가"}
              </button>
              <button
                type="button"
                onClick={startCreate}
                disabled={!canManageInstallers}
                className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-50"
              >
                새 입력으로 초기화
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

const inputClassName =
  "h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 outline-none transition focus:border-zinc-400";

const filterInputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400";
