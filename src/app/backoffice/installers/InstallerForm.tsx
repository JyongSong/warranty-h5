"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import {
  AQARA_APP_OPTIONS,
  CAPABILITY_OPTIONS,
  STANDARD_REGIONS,
  formatServiceAreas,
  parseServiceAreas,
  readJson,
  type InstallerItem,
} from "./shared";

// 추가와 수정이 같은 폼을 쓴다. 다른 것은 저장 대상 주소와 삭제 버튼 유무뿐이다.
//
// 폼은 스키마의 모든 편집 가능 항목을 담는다. 예전 화면에는 담당지역·설치가능항목·
// 연동등급·허브보유·활성이 빠져 있었는데, 수정 API 가 빠진 항목을 기본값으로
// 채우는 구조라 기사 한 명을 저장할 때마다 그 다섯이 조용히 지워졌다.
// 지금은 API 가 "보낸 것만 바꾸는" 방식이라 그 사고는 재발하지 않지만,
// 그렇다고 화면에서 못 고치면 관리가 안 되므로 전부 올려 둔다.

type FormValues = {
  name: string;
  phone: string;
  branch: string;
  region: string;
  coverage: string;
  address: string;
  category: string;
  ability: string;
  serviceAreas: string;
  capabilities: string[];
  aqaraAppCapability: string;
  hasAqaraHubInventory: boolean;
  asEmergencyAvailability: string;
  active: boolean;
  installCount: string;
  happyCallLt: string;
  defectCount: string;
  dissatisfactionNote: string;
};

function toFormValues(item: InstallerItem | null): FormValues {
  return {
    name: item?.name ?? "",
    phone: item?.phone ?? "",
    branch: item?.branch ?? "",
    region: item?.region ?? "",
    coverage: item?.coverage ?? "",
    address: item?.address ?? "",
    category: item?.category ?? "",
    ability: item?.ability ?? "",
    serviceAreas: formatServiceAreas(item?.serviceAreas),
    capabilities: item?.capabilities ?? [],
    aqaraAppCapability: item?.aqaraAppCapability ?? "NONE",
    hasAqaraHubInventory: item?.hasAqaraHubInventory ?? false,
    asEmergencyAvailability: item?.asEmergencyAvailability ?? "",
    active: item?.active ?? true,
    installCount: item?.installCount == null ? "" : String(item.installCount),
    happyCallLt: item?.happyCallLt == null ? "" : String(item.happyCallLt),
    defectCount: item?.defectCount == null ? "" : String(item.defectCount),
    dissatisfactionNote: item?.dissatisfactionNote ?? "",
  };
}

export default function InstallerForm({
  item,
  canManage,
}: {
  item: InstallerItem | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const isEdit = Boolean(item);
  const [values, setValues] = useState<FormValues>(() => toFormValues(item));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCapability(value: string) {
    setValues((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(value)
        ? prev.capabilities.filter((c) => c !== value)
        : [...prev.capabilities, value],
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;

    setSaving(true);
    setError(null);

    const payload = {
      name: values.name.trim(),
      phone: normalizePhone(values.phone),
      branch: values.branch,
      region: values.region,
      coverage: values.coverage,
      address: values.address,
      category: values.category,
      ability: values.ability,
      serviceAreas: parseServiceAreas(values.serviceAreas),
      capabilities: values.capabilities,
      aqaraAppCapability: values.aqaraAppCapability,
      hasAqaraHubInventory: values.hasAqaraHubInventory,
      asEmergencyAvailability: values.asEmergencyAvailability,
      active: values.active,
      installCount: values.installCount,
      happyCallLt: values.happyCallLt,
      defectCount: values.defectCount,
      dissatisfactionNote: values.dissatisfactionNote,
    };

    try {
      const res = await fetch(isEdit ? `/api/installers/${item!.id}` : "/api/installers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data?.error ?? "저장에 실패했습니다."));

      router.push("/backoffice/installers");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!item || !canManage) return;
    if (!window.confirm(`${item.name} 기사를 삭제할까요? 되돌릴 수 없습니다.`)) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/installers/${item.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data?.error ?? "삭제에 실패했습니다."));
      router.push("/backoffice/installers");
      router.refresh();
    } catch (err: unknown) {
      // 배차·정산 이력이 있으면 외래키에 막힌다. 그 경우 비활성으로 내리는 게 맞다.
      setError(
        `${getErrorMessage(err, "삭제에 실패했습니다.")} — 배차나 정산 이력이 있는 기사는 삭제할 수 없습니다. '활성' 을 꺼서 배차 대상에서 제외해 주세요.`,
      );
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!canManage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          현재 계정은 조회 전용입니다. 등급 1 이상만 수정할 수 있습니다.
        </div>
      ) : null}

      <Section title="기본 정보">
        <Field label="이름" required>
          <input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
        <Field label="전화번호" required hint="배차 문자와 기사앱 로그인에 쓰입니다.">
          <input
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
            disabled={!canManage}
            placeholder="010-0000-0000"
            className={inputClass}
          />
        </Field>
        <Field label="소속 / 상호">
          <input
            value={values.branch}
            onChange={(e) => set("branch", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
        <Field label="분류">
          <input
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
            disabled={!canManage}
            placeholder="예: PL, 개인"
            className={inputClass}
          />
        </Field>
        <Field label="주소">
          <input
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="담당 지역">
        <Field label="광역">
          <select
            value={values.region}
            onChange={(e) => set("region", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          >
            <option value="">선택 안 함</option>
            {STANDARD_REGIONS.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </Field>
        <Field
          label="담당 지역 (배차 기준)"
          hint="한 줄에 하나씩. 예: 서울특별시 강남구 — 이 목록이 비면 이 기사에게는 배차가 가지 않습니다."
          wide
        >
          <textarea
            value={values.serviceAreas}
            onChange={(e) => set("serviceAreas", e.target.value)}
            disabled={!canManage}
            rows={5}
            placeholder={"서울특별시 강남구\n서울특별시 서초구"}
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
        </Field>
        <Field label="지역 메모" hint="표시용입니다. 배차 판단에는 위 담당 지역을 씁니다." wide>
          <input
            value={values.coverage}
            onChange={(e) => set("coverage", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="설치 능력">
        <Field label="설치 가능 항목" hint="비워 두면 배차 후보에서 제외됩니다." wide>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_OPTIONS.map((option) => {
              const on = values.capabilities.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!canManage}
                  onClick={() => toggleCapability(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    on
                      ? "bg-zinc-950 text-white"
                      : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Aqara 앱 연동">
          <select
            value={values.aqaraAppCapability}
            onChange={(e) => set("aqaraAppCapability", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          >
            {AQARA_APP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="허브 재고 보유">
          <Toggle
            checked={values.hasAqaraHubInventory}
            disabled={!canManage}
            onChange={(next) => set("hasAqaraHubInventory", next)}
            label={values.hasAqaraHubInventory ? "보유" : "미보유"}
          />
        </Field>
        <Field
          label="A/S 긴급출동 가능여부"
          hint="예: 주중 / 야간 모두 가능. 앞으로 A/S 배차가 이 값을 참고합니다."
          wide
        >
          <input
            value={values.asEmergencyAvailability}
            onChange={(e) => set("asEmergencyAvailability", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
        <Field label="능력 메모" wide>
          <input
            value={values.ability}
            onChange={(e) => set("ability", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="운영">
        <Field label="활성" hint="끄면 배차 후보와 기사앱 로그인에서 빠집니다.">
          <Toggle
            checked={values.active}
            disabled={!canManage}
            onChange={(next) => set("active", next)}
            label={values.active ? "활성" : "비활성"}
          />
        </Field>
        {isEdit ? (
          <Field label="기사 명단" hint="기사 명단(엑셀) 반영 시 자동으로 갱신됩니다. 직접 고칠 수 없습니다.">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                item!.inCurrentRoster
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {item!.inCurrentRoster ? "이번 명단에 있음" : "이번 명단에 없음"}
            </span>
          </Field>
        ) : null}
        <Field label="설치 실적">
          <input
            value={values.installCount}
            onChange={(e) => set("installCount", e.target.value)}
            disabled={!canManage}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Happy Call LT">
          <input
            value={values.happyCallLt}
            onChange={(e) => set("happyCallLt", e.target.value)}
            disabled={!canManage}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="하자 건수">
          <input
            value={values.defectCount}
            onChange={(e) => set("defectCount", e.target.value)}
            disabled={!canManage}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="불만 사항" wide>
          <input
            value={values.dissatisfactionNote}
            onChange={(e) => set("dissatisfactionNote", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canManage || saving || deleting}
            className={getBackofficeButtonClass("primary", "lg")}
          >
            {saving ? "저장 중…" : isEdit ? "저장" : "기사 추가"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/backoffice/installers")}
            className={getBackofficeButtonClass("secondary", "lg")}
          >
            취소
          </button>
        </div>
        {isEdit && canManage ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving || deleting}
            className={getBackofficeButtonClass("dangerSecondary", "lg")}
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-500";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-semibold text-zinc-600">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        checked
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-zinc-300 bg-white text-zinc-600"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${checked ? "bg-emerald-500" : "bg-zinc-400"}`}
      />
      {label}
    </button>
  );
}
