"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import {
  enqueueCompletion,
  uploadAndSubmitCompletion,
  type QueuedCompletionInput,
} from "@/lib/installer/completionQueue";
import { compressImage } from "@/lib/installer/image";
import ConfirmAmountDialog, { type AmountLine } from "../../../ConfirmAmountDialog";
import { previewInstallSettlementAction, type SettlementPreview } from "./actions";
import PhotoPicker from "../../../PhotoPicker";
import * as ui from "../../../ui";

const CAPABILITIES = [
  { value: "NONE", label: "없음 (연동 안 함)" },
  { value: "DOORLOCK_AND_APP", label: "APP 연동" },
  { value: "DOORLOCK_AND_APP_AND_HUB", label: "허브 연동 (APP 포함)" },
] as const;

// 장거리 구간. 기사 등록 주소와 고객 설치 주소 사이의 거리로 고른다.
const LONG_DISTANCE_OPTIONS = [
  { amount: 0, label: "해당 없음 (20km 이하)" },
  { amount: 20000, label: "20km 초과 ~ 40km 이하" },
  { amount: 40000, label: "40km 초과" },
] as const;

const ERR: Record<string, string> = {
  ORDER_NOT_SUBMITTABLE: "완료 등록할 수 없는 상태입니다.",
  PHOTO_COUNT_INVALID: "사진을 1~4장 첨부해 주세요.",
  PHOTO_MISSING: "사진 업로드가 완료되지 않았습니다. 사진을 다시 첨부해 주세요.",
  INVALID_CAPABILITY: "앱/허브 연동 항목을 확인해 주세요.",
  EXTRA_CLAIM_REASON_REQUIRED: "기타 청구 금액의 사유를 입력해 주세요.",
  EXTRA_CLAIM_REASON_TOO_LONG: "기타 청구 사유는 500자 이내로 입력해 주세요.",
  EXTRA_CLAIM_AMOUNT_INVALID: "기타 청구 금액을 확인해 주세요.",
  EXTRA_CLAIM_PHOTO_COUNT_INVALID: "증빙 사진은 최대 4장까지 첨부할 수 있습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

export default function CompleteClient({
  orderId,
  erpOrderNo,
  address,
  linkageAppFee,
  linkageHubFee,
}: {
  orderId: string;
  erpOrderNo: string;
  address: string;
  /** 이 기사에게 적용되는 연동비. 선택지 옆에 그대로 보여 준다. */
  linkageAppFee: number;
  linkageHubFee: number;
}) {
  const router = useRouter();
  const [capability, setCapability] = useState<string>("NONE");
  const [wallpadLinked, setWallpadLinked] = useState(false);
  const [wallpadAmount, setWallpadAmount] = useState("");
  const [longDistanceAmount, setLongDistanceAmount] = useState(0);
  const [extraClaimAmount, setExtraClaimAmount] = useState("");
  const [extraClaimReason, setExtraClaimReason] = useState("");
  const [extraClaimPhotos, setExtraClaimPhotos] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);

  const hasLinkage = capability !== "NONE";
  const linkageFees: Record<string, number> = {
    NONE: 0,
    DOORLOCK_AND_APP: linkageAppFee,
    DOORLOCK_AND_APP_AND_HUB: linkageHubFee,
  };
  // 0 은 청구가 없는 것으로 본다(서버도 같은 기준).
  const hasExtraClaim = (toNumberOrNull(extraClaimAmount) ?? 0) > 0;
  const extraClaimReasonMissing = hasExtraClaim && !extraClaimReason.trim();
  const canSubmit =
    photos.length >= 1 &&
    photos.length <= 4 &&
    !extraClaimReasonMissing &&
    !busy &&
    !compressing;

  async function addPhotos(list: FileList | null) {
    if (!list) return;
    setCompressing(true);
    const incoming = Array.from(list).slice(0, 4 - photos.length);
    const compressed = await Promise.all(incoming.map(compressImage));
    setPhotos((prev) => [...prev, ...compressed].slice(0, 4));
    setCompressing(false);
  }

  async function addExtraClaimPhotos(list: FileList | null) {
    if (!list) return;
    setCompressing(true);
    const incoming = Array.from(list).slice(0, 4 - extraClaimPhotos.length);
    const compressed = await Promise.all(incoming.map(compressImage));
    setExtraClaimPhotos((prev) => [...prev, ...compressed].slice(0, 4));
    setCompressing(false);
  }

  // 제출 버튼은 곧바로 보내지 않고 금액을 먼저 계산해 보여준다.
  async function askConfirm() {
    setError(null);
    setBusy(true);

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const result: SettlementPreview = offline
      ? { ok: false }
      : await previewInstallSettlementAction({
          orderId,
          capability,
          longDistanceAmount: longDistanceAmount > 0 ? longDistanceAmount : null,
          extraClaimAmount: hasExtraClaim ? toNumberOrNull(extraClaimAmount) : null,
          wallpadAmount: toNumberOrNull(wallpadAmount),
        });

    setPreview(result);
    setBusy(false);
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);

    const amount = wallpadAmount.replace(/[^\d]/g, "");
    const entry: QueuedCompletionInput = {
      orderId,
      capability,
      wallpadLinked,
      wallpadAmount: amount ? Number(amount) : null,
      longDistanceAmount: longDistanceAmount > 0 ? longDistanceAmount : null,
      // 금액이 없으면 사유·증빙도 보내지 않는다. 적다 만 내용이 딸려 가지 않게.
      extraClaimAmount: hasExtraClaim ? toNumberOrNull(extraClaimAmount) : null,
      extraClaimReason: hasExtraClaim ? extraClaimReason.trim() : null,
      extraClaimPhotos: hasExtraClaim ? extraClaimPhotos : [],
      // 설치 종료 시각 = 지금 제출을 누른 시각. 오프라인 대기열에 들어가도
      // 나중에 전송된 시각이 아니라 이 시각이 남는다.
      installEndAt: new Date().toISOString(),
      photos,
    };

    // Offline → save locally and auto-send when connectivity returns.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueCompletion(entry);
      } catch {
        // ignore — nothing more we can do offline
      }
      setBusy(false);
      router.push("/installer");
      return;
    }

    const res = await uploadAndSubmitCompletion(entry);
    if (res.ok) {
      setBusy(false);
      router.push("/installer");
      return;
    }
    if (res.retriable) {
      // network dropped mid-submit → queue for auto-retry
      try {
        await enqueueCompletion(entry);
      } catch {
        // ignore
      }
      setBusy(false);
      router.push("/installer");
      return;
    }
    setBusy(false);
    setConfirming(false);
    setError(ERR[res.error] ?? ERR.DEFAULT);
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <button style={backLink} onClick={() => router.push(`/installer/orders/${orderId}`)}>
          ← 취소
        </button>
        <h1 style={ui.h1}>완료 등록</h1>
        <p style={ui.sub}>
          {erpOrderNo}
          {address ? ` · ${address}` : ""}
        </p>

        <div style={ui.card}>
          <div style={ui.label}>앱/허브 연동</div>
          {CAPABILITIES.map((c) => (
            <label key={c.value} style={radioRow}>
              <input
                type="radio"
                name="capability"
                checked={capability === c.value}
                onChange={() => setCapability(c.value)}
              />
              <span style={optionLabel}>{c.label}</span>
              <OptionAmount amount={linkageFees[c.value]} />
            </label>
          ))}
          {hasLinkage ? (
            <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>
              연동 시 APP 화면 사진을 반드시 포함해 주세요.
            </div>
          ) : null}
        </div>

        <div style={ui.card}>
          <label style={checkRow}>
            <input type="checkbox" checked={wallpadLinked} onChange={(e) => setWallpadLinked(e.target.checked)} />
            <span>월패드 연동함 (현장 결제)</span>
          </label>
          {wallpadLinked ? (
            <div style={{ marginTop: 10 }}>
              <MoneyInput value={wallpadAmount} onChange={setWallpadAmount} placeholder="현장 금액 (선택)" />
            </div>
          ) : null}
        </div>

        <div style={ui.card}>
          <div style={ui.label}>장거리 비용</div>
          {LONG_DISTANCE_OPTIONS.map((o) => (
            <label key={o.amount} style={radioRow}>
              <input
                type="radio"
                name="longDistance"
                checked={longDistanceAmount === o.amount}
                onChange={() => setLongDistanceAmount(o.amount)}
              />
              <span style={optionLabel}>{o.label}</span>
              <OptionAmount amount={o.amount} />
            </label>
          ))}
          <div style={{ ...helpText, margin: "6px 0 0" }}>
            장거리 기준은 기사님 등록 주소와 고객 설치 주소 사이의 네이버 지도 최단 거리입니다.
            본사에서 거리를 확인한 뒤 승인된 건에 한해 지급됩니다.
          </div>
        </div>

        <div style={ui.card}>
          <label style={ui.label}>기타 청구 금액 (선택)</label>
          <div style={helpText}>
            이 주문과 관련해 본사에 청구할 다른 금액이 있으면 입력해 주세요. 본사 확인 후
            승인되면 정산 금액에 포함되어 지급됩니다.
          </div>
          <MoneyInput value={extraClaimAmount} onChange={setExtraClaimAmount} placeholder="청구 금액" />
          {hasExtraClaim ? (
            <>
              <textarea
                style={{ ...ui.input, marginTop: 10, minHeight: 84, resize: "vertical" }}
                value={extraClaimReason}
                onChange={(e) => setExtraClaimReason(e.target.value)}
                maxLength={500}
                placeholder="청구 사유 (필수) — 무엇에 든 비용인지 적어 주세요"
              />
              {extraClaimReasonMissing ? (
                <div style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>
                  청구 사유를 입력해야 제출할 수 있습니다.
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {hasExtraClaim ? (
          <PhotoPicker
            label="기타 청구 증빙 사진 (선택, 최대 4장)"
            photos={extraClaimPhotos}
            busy={compressing}
            onAdd={(files) => void addExtraClaimPhotos(files)}
            onRemove={(index) => setExtraClaimPhotos(extraClaimPhotos.filter((_, i) => i !== index))}
          />
        ) : null}

        <PhotoPicker
          label="사진 (1~4장)"
          photos={photos}
          busy={compressing}
          onAdd={(files) => void addPhotos(files)}
          onRemove={(index) => setPhotos(photos.filter((_, i) => i !== index))}
        />

        {error ? <div style={ui.errorText}>{error}</div> : null}

        <div style={{ marginTop: 8 }}>
          <button style={ui.primaryButton(!canSubmit)} disabled={!canSubmit} onClick={askConfirm}>
            {busy ? "제출 중…" : "완료 제출"}
          </button>
        </div>
      </div>

      <ConfirmAmountDialog
        open={confirming}
        title="이 금액으로 완료 등록합니다"
        amount={preview?.ok ? preview.totalAmount : null}
        lines={previewLines(preview)}
        note={previewNote(preview)}
        busy={busy}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </main>
  );
}

// 선택지 오른쪽에 붙는 "+20,000원". 0원이면 아무것도 보여 주지 않는다.
function OptionAmount({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return <span style={optionAmount}>+{amount.toLocaleString()}원</span>;
}

// 금액 입력란. 숫자만 받아 천 단위로 끊어 보여 주고 "원" 은 오른쪽에 붙박아 둔다.
// value 는 숫자만 담은 문자열이다.
function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (digits: string) => void;
  placeholder: string;
}) {
  const digits = value.replace(/[^\d]/g, "");
  return (
    <div style={{ position: "relative" }}>
      <input
        style={{ ...ui.input, paddingRight: 40 }}
        value={digits ? Number(digits).toLocaleString() : ""}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))}
        inputMode="numeric"
        placeholder={placeholder}
      />
      <span style={{ ...moneySuffix, color: digits ? "#18181b" : "#a1a1aa" }}>원</span>
    </div>
  );
}

function toNumberOrNull(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function previewLines(preview: SettlementPreview | null): AmountLine[] {
  if (!preview?.ok) return [];
  return [
    { label: "연동비", value: preview.linkageFee },
    { label: "출장비", value: preview.travelFee },
    { label: "장거리", value: preview.longDistanceFee },
    { label: "기타 청구", value: preview.extraClaimFee },
    // 할증 폐지 전에 처음 제출했던 건을 다시 올릴 때만 남아 있는 항목.
    ...(preview.nightWeekendFee > 0 ? [{ label: "야간/휴일", value: preview.nightWeekendFee }] : []),
  ];
}

function previewNote(preview: SettlementPreview | null) {
  if (!preview?.ok) return null;
  const tags = [preview.night ? "야간" : null, preview.weekend ? "휴일" : null].filter(Boolean);
  return (
    <>
      {tags.length > 0 ? <div>{tags.join(" · ")} 할증이 적용됐습니다.</div> : null}
      {preview.wallpadAmount > 0 ? (
        <div>
          월패드 현장 수금 {preview.wallpadAmount.toLocaleString()}원은 정산 금액에 포함되지 않습니다.
        </div>
      ) : null}
      {preview.extraClaimFee > 0 ? (
        <div>기타 청구 금액은 본사 확인 후 승인된 금액만 지급됩니다.</div>
      ) : null}
      <div>본사 승인 후 확정됩니다.</div>
    </>
  );
}

const backLink: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#52525b",
  fontSize: 14,
  fontWeight: 600,
  padding: "4px 0",
  marginBottom: 8,
  cursor: "pointer",
};

const helpText: CSSProperties = { fontSize: 12, color: "#71717a", lineHeight: 1.5, margin: "0 0 10px" };

const radioRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 15 };
const checkRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontSize: 15 };
const optionLabel: CSSProperties = { flex: 1, minWidth: 0 };
const optionAmount: CSSProperties = { fontSize: 14, fontWeight: 600, color: "#52525b", whiteSpace: "nowrap" };
const moneySuffix: CSSProperties = {
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 16,
  pointerEvents: "none",
};
