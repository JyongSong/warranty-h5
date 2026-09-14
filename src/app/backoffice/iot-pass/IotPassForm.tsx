"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { getErrorMessage } from "@/lib/error";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import {
  FEATURE_CODE_SUGGESTIONS,
  PAYMENT_PROVIDER_SUGGESTIONS,
  PURCHASE_STATUS_OPTIONS,
  formatKstDateTime,
  fromKstInputValue,
  readJson,
  toKstInputValue,
  type IotPassItem,
} from "./shared";

// 추가와 수정이 같은 폼을 쓴다. 다른 것은 저장 대상 주소와 삭제 버튼 유무뿐이다.
//
// 이 표는 cafe24 웹훅과 서드파티 API 도 함께 쓴다. 그래서 수정은 "보낸 항목만 바꾸는"
// PATCH 로 보낸다. 폼에 없는 값이 기본값으로 덮이면 결제 이력이 조용히 지워진다.

type FormValues = {
  sn: string;
  contact: string;
  purchaseStatus: string;
  featureCode: string;
  paymentProvider: string;
  paidAt: string;
  lastHubBoundAt: string;
};

function toFormValues(item: IotPassItem | null): FormValues {
  return {
    sn: item?.sn ?? "",
    contact: item?.contact ?? "",
    purchaseStatus: item?.purchaseStatus ?? "pending",
    featureCode: item?.featureCode ?? "zigbee",
    paymentProvider: item?.paymentProvider ?? "manual",
    paidAt: toKstInputValue(item?.paidAt),
    lastHubBoundAt: toKstInputValue(item?.lastHubBoundAt),
  };
}

function nowKstInputValue() {
  return toKstInputValue(new Date().toISOString());
}

export default function IotPassForm({
  item,
  canManage,
}: {
  item: IotPassItem | null;
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

  function onStatusChange(next: string) {
    setValues((prev) => ({
      ...prev,
      purchaseStatus: next,
      // 결제 완료로 바꾸는데 결제일시가 비어 있으면 지금 시각을 채워 둔다.
      // 기기 검증은 상태만 보지만, 이력이 비면 나중에 환불·정산에서 근거가 없다.
      paidAt: next === "paid" && !prev.paidAt ? nowKstInputValue() : prev.paidAt,
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;

    setSaving(true);
    setError(null);

    const payload = {
      sn: values.sn.trim().toUpperCase(),
      contact: values.contact,
      purchaseStatus: values.purchaseStatus,
      featureCode: values.featureCode,
      paymentProvider: values.paymentProvider,
      paidAt: fromKstInputValue(values.paidAt),
      lastHubBoundAt: fromKstInputValue(values.lastHubBoundAt),
    };

    try {
      const res = await fetch(isEdit ? `/api/iot-pass/${item!.id}` : "/api/iot-pass", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data?.error ?? "저장에 실패했습니다."));

      router.push("/backoffice/iot-pass");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!item || !canManage) return;
    if (
      !window.confirm(
        `${item.sn} 의 IoT Pass 기록을 삭제할까요? 결제 완료 기록이라면 해당 기기의 업그레이드 권한이 사라집니다.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/iot-pass/${item.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data?.error ?? "삭제에 실패했습니다."));
      router.push("/backoffice/iot-pass");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "삭제에 실패했습니다."));
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

      {isEdit && !item!.shipped ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          이 SN 은 출고 기기 목록에 없습니다. 기기 검증(SN 확인) 단계에서 막히니 SN 을 확인해 주세요.
        </div>
      ) : null}

      <Section title="기기">
        <Field label="SN" required hint="출고 기기 SN. 대문자로 저장됩니다.">
          <input
            value={values.sn}
            onChange={(e) => set("sn", e.target.value)}
            required
            disabled={!canManage}
            placeholder="A01460..."
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
        <Field label="모델">
          <span className="block py-2 text-sm text-zinc-700">
            {isEdit ? (item!.deviceModel || (item!.shipped ? "-" : "출고 목록에 없음")) : "저장 후 표시됩니다."}
          </span>
        </Field>
        <Field label="기능 코드" hint="지금은 zigbee(L100 SE Zigbee 업그레이드) 하나만 씁니다.">
          <input
            list="iot-pass-form-feature-codes"
            value={values.featureCode}
            onChange={(e) => set("featureCode", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
          <datalist id="iot-pass-form-feature-codes">
            {FEATURE_CODE_SUGGESTIONS.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
        </Field>
        <Field label="연락처" hint="cafe24 주문이면 주문자 연락처가 들어옵니다.">
          <input
            value={values.contact}
            onChange={(e) => set("contact", e.target.value)}
            disabled={!canManage}
            placeholder="010-0000-0000"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="결제">
        <Field label="결제 상태" hint="'결제 완료' 여야 해당 기기의 업그레이드가 열립니다.">
          <select
            value={values.purchaseStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            disabled={!canManage}
            className={inputClass}
          >
            {PURCHASE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="결제 경로" hint="cafe24 웹훅이 넣은 값은 cafe24 입니다. 수기 등록은 manual.">
          <input
            list="iot-pass-form-payment-providers"
            value={values.paymentProvider}
            onChange={(e) => set("paymentProvider", e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
          <datalist id="iot-pass-form-payment-providers">
            {PAYMENT_PROVIDER_SUGGESTIONS.map((provider) => (
              <option key={provider} value={provider} />
            ))}
          </datalist>
        </Field>
        <Field label="결제일시 (한국 시각)" wide>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={values.paidAt}
              onChange={(e) => set("paidAt", e.target.value)}
              disabled={!canManage}
              className={`${inputClass} sm:w-64`}
            />
            <button
              type="button"
              disabled={!canManage}
              onClick={() => set("paidAt", nowKstInputValue())}
              className={getBackofficeButtonClass("secondary", "sm")}
            >
              지금
            </button>
            {values.paidAt ? (
              <button
                type="button"
                disabled={!canManage}
                onClick={() => set("paidAt", "")}
                className={getBackofficeButtonClass("secondary", "sm")}
              >
                비우기
              </button>
            ) : null}
          </div>
        </Field>
      </Section>

      <Section title="허브 연동">
        <Field
          label="마지막 허브 연동 시각 (한국 시각)"
          hint="보통 서드파티 API(device-upgrade-status)가 채웁니다. 직접 고칠 일은 드뭅니다."
          wide
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={values.lastHubBoundAt}
              onChange={(e) => set("lastHubBoundAt", e.target.value)}
              disabled={!canManage}
              className={`${inputClass} sm:w-64`}
            />
            {values.lastHubBoundAt ? (
              <button
                type="button"
                disabled={!canManage}
                onClick={() => set("lastHubBoundAt", "")}
                className={getBackofficeButtonClass("secondary", "sm")}
              >
                비우기
              </button>
            ) : null}
          </div>
        </Field>
        {isEdit ? (
          <>
            <Field label="등록일">
              <span className="block py-2 text-sm text-zinc-700">{formatKstDateTime(item!.createdAt)}</span>
            </Field>
            <Field label="수정일">
              <span className="block py-2 text-sm text-zinc-700">{formatKstDateTime(item!.updatedAt)}</span>
            </Field>
          </>
        ) : null}
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canManage || saving || deleting}
            className={getBackofficeButtonClass("primary", "lg")}
          >
            {saving ? "저장 중…" : isEdit ? "저장" : "IoT Pass 추가"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/backoffice/iot-pass")}
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
