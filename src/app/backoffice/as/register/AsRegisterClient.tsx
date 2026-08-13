"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AsSymptomCategory } from "@/lib/installation/as/symptom-codes";
import {
  createAsOrderAction,
  lookupOriginalInstallerAction,
  recommendAsInstallersAction,
} from "../actions";
import type { AsInstallerRecommendation } from "@/lib/installation/as/service";

const input = "h-9 w-full rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-950";
const label = "text-xs font-semibold text-zinc-600";
const btnPrimary = "h-9 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:bg-zinc-400";
const btnSecondary = "h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700";

type SelectedInstaller = { id: string; name: string; from: "original" | "address" } | null;

export default function AsRegisterClient({ categories }: { categories: AsSymptomCategory[] }) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [categoryCode, setCategoryCode] = useState(categories[0]?.code ?? "");
  const [symptomCode, setSymptomCode] = useState("");
  const [symptomDetail, setSymptomDetail] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [memo, setMemo] = useState("");
  const [selected, setSelected] = useState<SelectedInstaller>(null);
  const [originalInstallationOrderId, setOriginalInstallationOrderId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AsInstallerRecommendation[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const symptoms = useMemo(
    () => categories.find((c) => c.code === categoryCode)?.symptoms ?? [],
    [categories, categoryCode],
  );

  const canSubmit = symptomCode.length > 0 && !busy;

  async function findOriginal() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await lookupOriginalInstallerAction({ orderNo, phone: customerPhone });
    setBusy(false);
    if (!res.ok) {
      setError("조회에 실패했습니다.");
      return;
    }
    if (res.result) {
      setSelected({ id: res.result.installerId, name: res.result.installerName, from: "original" });
      setOriginalInstallationOrderId(res.result.installationOrderId);
      setNotice(`원 설치기사: ${res.result.installerName}`);
    } else {
      setNotice("원 설치 이력을 찾지 못했습니다. 주소로 추천하거나 직접 지정하세요.");
    }
  }

  async function recommendByAddress() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await recommendAsInstallersAction(address);
    setBusy(false);
    if (!res.ok) {
      setError("추천에 실패했습니다.");
      return;
    }
    setCandidates(res.recommendations);
    if (res.recommendations.length === 0) setNotice("주소에 맞는 후보가 없습니다.");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createAsOrderAction({
      customerName,
      customerPhone,
      address,
      symptomCode,
      symptomDetail,
      orderNo,
      memo,
      originalInstallationOrderId,
      assignInstallerId: selected?.id ?? null,
    });
    setBusy(false);
    if (res.ok) {
      router.push("/backoffice/as/search");
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-1 text-lg font-bold text-zinc-900">A/S 등록</h1>
      <p className="mb-4 text-sm text-zinc-500">고객·증상 정보를 입력하고 기사를 지정합니다.</p>

      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="고객명">
            <input className={input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="연락처">
            <input className={input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" placeholder="010-1234-5678" />
          </Field>
        </div>
        <Field label="주소">
          <input className={input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="서울 관악구 …" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="증상 분류">
            <select
              className={input}
              value={categoryCode}
              onChange={(e) => {
                setCategoryCode(e.target.value);
                setSymptomCode("");
              }}
            >
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="증상 코드 (필수)">
            <select className={input} value={symptomCode} onChange={(e) => setSymptomCode(e.target.value)}>
              <option value="">선택</option>
              {symptoms.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="상세 증상">
          <textarea
            className="min-h-[72px] w-full rounded-md border border-zinc-300 p-3 text-sm text-zinc-900 outline-none focus:border-zinc-950"
            value={symptomDetail}
            onChange={(e) => setSymptomDetail(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="연결 주문번호">
            <input className={input} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ISU…" />
          </Field>
          <Field label="메모">
            <input className={input} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-600">기사 지정</div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={busy} onClick={findOriginal}>
              원 설치기사 찾기 (주문번호/전화)
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={recommendByAddress}>
              주소로 기사 추천
            </button>
          </div>
          {selected ? (
            <div className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              지정됨: <b>{selected.name}</b> ({selected.from === "original" ? "원 설치기사" : "주소 추천"})
              <button type="button" className="ml-2 text-xs text-zinc-500 underline" onClick={() => setSelected(null)}>
                해제
              </button>
            </div>
          ) : (
            <div className="mb-2 text-sm text-zinc-500">미지정 시 접수만 되고 나중에 배정합니다.</div>
          )}
          {candidates.length > 0 ? (
            <div className="grid gap-1">
              {candidates.map((c) => (
                <button
                  key={c.installerId}
                  type="button"
                  onClick={() => setSelected({ id: c.installerId, name: c.name, from: "address" })}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-zinc-400"
                >
                  <span>
                    {c.name} <span className="text-zinc-400">· {c.region ?? "-"}</span>
                  </span>
                  <span className="text-xs text-zinc-400">{c.matchTier ?? ""}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {notice ? <div className="text-sm text-zinc-600">{notice}</div> : null}
        {error ? <div className="text-sm text-red-600">등록 실패: {error}</div> : null}

        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={() => router.push("/backoffice/as/search")}>
            취소
          </button>
          <button type="button" className={btnPrimary} disabled={!canSubmit} onClick={submit}>
            {busy ? "처리 중…" : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={label}>{text}</span>
      {children}
    </label>
  );
}
