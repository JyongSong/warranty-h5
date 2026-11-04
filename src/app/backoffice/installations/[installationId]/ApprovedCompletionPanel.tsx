"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstallationCompletionView } from "@/lib/installation/completion/service";
import { computeInstallLineItems } from "@/lib/installation/settlement/compute";
import type { EffectiveRates } from "@/lib/installation/settlement/rates";
import { editApprovedCompletionAction, revertApprovedCompletionAction } from "./edit-actions";
import { getAdminEditErrorMessage } from "./admin-edit-messages";

const CAPABILITY_OPTIONS = [
  { value: "NONE", label: "없음" },
  { value: "DOORLOCK_AND_APP", label: "APP 연동" },
  { value: "DOORLOCK_AND_APP_AND_HUB", label: "허브 연동" },
];

type Mode = "idle" | "edit" | "revert";

export default function ApprovedCompletionPanel({
  orderId,
  completion,
  rates,
}: {
  orderId: string;
  completion: InstallationCompletionView;
  rates: EffectiveRates | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [capability, setCapability] = useState(completion.achievedAqaraAppCapability);
  const [wallpadLinked, setWallpadLinked] = useState(completion.wallpadLinked);
  const [wallpadAmount, setWallpadAmount] = useState(toInput(completion.wallpadAmount));
  const [longDistance, setLongDistance] = useState(toInput(completion.longDistanceAmount));
  const [extraClaim, setExtraClaim] = useState(toInput(completion.extraClaimAmount));
  const [extraClaimReason, setExtraClaimReason] = useState(completion.extraClaimReason ?? "");
  const [reason, setReason] = useState("");

  const preview =
    rates && mode === "edit"
      ? computeInstallLineItems({
          achievedAqaraAppCapability: capability,
          longDistanceAmount: toAmount(longDistance) ?? 0,
          extraClaimAmount: toAmount(extraClaim) ?? 0,
          wallpadAmount: wallpadLinked ? toAmount(wallpadAmount) : null,
          installEndAt: new Date(completion.installEndAt),
          firstSubmittedAt: new Date(completion.firstSubmittedAt),
          rates,
        })
      : null;

  function start(next: Mode) {
    setCapability(completion.achievedAqaraAppCapability);
    setWallpadLinked(completion.wallpadLinked);
    setWallpadAmount(toInput(completion.wallpadAmount));
    setLongDistance(toInput(completion.longDistanceAmount));
    setExtraClaim(toInput(completion.extraClaimAmount));
    setExtraClaimReason(completion.extraClaimReason ?? "");
    setReason("");
    setError(null);
    setNotice(null);
    setMode(next);
  }

  async function saveEdit() {
    if (!reason.trim()) {
      setError(getAdminEditErrorMessage("EDIT_REASON_REQUIRED"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await editApprovedCompletionAction({
      orderId,
      reason,
      achievedAqaraAppCapability: capability,
      wallpadLinked,
      wallpadAmount: wallpadLinked ? toAmount(wallpadAmount) : null,
      longDistanceAmount: toAmount(longDistance),
      extraClaimAmount: toAmount(extraClaim),
      extraClaimReason: extraClaimReason || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(getAdminEditErrorMessage(result.error));
      return;
    }
    setMode("idle");
    setNotice("완료 내용을 수정하고 정산 금액을 다시 확정했습니다.");
    router.refresh();
  }

  async function confirmRevert() {
    if (!reason.trim()) {
      setError(getAdminEditErrorMessage("REVERT_REASON_REQUIRED"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await revertApprovedCompletionAction({ orderId, reason });
    setBusy(false);
    if (!result.ok) {
      setError(getAdminEditErrorMessage(result.error));
      return;
    }
    setMode("idle");
    router.refresh();
  }

  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-zinc-950">승인된 완료 관리</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            승인한 완료 내용을 고치거나, 승인을 취소하고 기사에게 다시 제출하게 할 수 있습니다.
          </p>
        </div>
        {mode === "idle" ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => start("edit")}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              내용 수정
            </button>
            <button
              type="button"
              onClick={() => start("revert")}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              승인 취소 (재제출 요청)
            </button>
          </div>
        ) : null}
      </div>

      {notice && mode === "idle" ? <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}

      {mode === "edit" ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-bold text-zinc-600">앱 연동 결과</span>
            <select
              value={capability}
              onChange={(event) => setCapability(event.target.value)}
              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-950"
            >
              {CAPABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 pt-5 text-sm font-semibold text-zinc-800">
              <input
                type="checkbox"
                checked={wallpadLinked}
                onChange={(event) => setWallpadLinked(event.target.checked)}
                className="h-4 w-4"
              />
              월패드 연동함
            </label>
            <AmountInput label="월패드 금액 (현장 수금)" value={wallpadAmount} onChange={setWallpadAmount} disabled={!wallpadLinked} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AmountInput label="장거리 비용" value={longDistance} onChange={setLongDistance} />
            <AmountInput label="기타 청구 금액" value={extraClaim} onChange={setExtraClaim} />
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-zinc-600">기타 청구 사유</span>
            <input
              value={extraClaimReason}
              onChange={(event) => setExtraClaimReason(event.target.value)}
              disabled={!toAmount(extraClaim)}
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950 disabled:bg-zinc-50"
            />
          </label>
          <ReasonInput value={reason} onChange={setReason} placeholder="예: 허브 연동 확인되어 연동 결과 정정" />
          {preview ? (
            <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
              <span className="font-bold text-zinc-700">수정 후 정산 금액 </span>
              <span className="font-extrabold">{preview.items.totalAmount.toLocaleString()}원</span>
              <span className="ml-2 text-xs text-zinc-500">
                (연동비 {preview.items.linkageFee.toLocaleString()} · 출장비 {preview.items.travelFee.toLocaleString()} · 장거리{" "}
                {preview.items.longDistanceFee.toLocaleString()} · 기타 {preview.items.extraClaimFee.toLocaleString()})
              </span>
            </div>
          ) : null}
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <ActionButtons busy={busy} primaryLabel="저장" onPrimary={saveEdit} onCancel={() => setMode("idle")} />
        </div>
      ) : null}

      {mode === "revert" ? (
        <div className="mt-4 grid gap-3">
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
            승인을 취소하면 주문이 기사 배정 완료 상태로 돌아가고, 확정한 정산 금액은 지워집니다. 기사에게 앱 알림과 문자로 사유가
            전달되며, 기사가 완료 등록을 다시 하면 완료 검수에서 다시 승인합니다.
          </p>
          <ReasonInput value={reason} onChange={setReason} placeholder="기사에게 전달됩니다. 예: 연동 화면 사진이 다른 현장 사진입니다" />
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <ActionButtons
            busy={busy}
            primaryLabel="승인 취소 확정"
            danger
            onPrimary={confirmRevert}
            onCancel={() => setMode("idle")}
          />
        </div>
      ) : null}
    </section>
  );
}

function AmountInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold text-zinc-600">{label} (원)</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="numeric"
        placeholder="0"
        disabled={disabled}
        className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950 disabled:bg-zinc-50"
      />
    </label>
  );
}

function ReasonInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold text-zinc-600">사유 (이력에 남습니다)</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={placeholder}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
      />
    </label>
  );
}

function ActionButtons({
  busy,
  primaryLabel,
  danger,
  onPrimary,
  onCancel,
}: {
  busy: boolean;
  primaryLabel: string;
  danger?: boolean;
  onPrimary: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onPrimary}
        className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-700" : "bg-zinc-950"}`}
      >
        {busy ? "처리 중…" : primaryLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
      >
        취소
      </button>
    </div>
  );
}

function toInput(value: number | null) {
  return value != null ? String(value) : "";
}

function toAmount(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}
