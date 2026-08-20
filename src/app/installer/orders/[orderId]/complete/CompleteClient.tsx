"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import {
  enqueueCompletion,
  uploadAndSubmitCompletion,
  type QueuedCompletionInput,
} from "@/lib/installer/completionQueue";
import ConfirmAmountDialog, { type AmountLine } from "../../../ConfirmAmountDialog";
import { previewInstallSettlementAction, type SettlementPreview } from "./actions";
import PhotoPicker from "../../../PhotoPicker";
import * as ui from "../../../ui";

const CAPABILITIES = [
  { value: "NONE", label: "없음 (연동 안 함)" },
  { value: "DOORLOCK_AND_APP", label: "APP 연동" },
  { value: "DOORLOCK_AND_APP_AND_HUB", label: "허브 연동 (APP 포함)" },
] as const;

const ERR: Record<string, string> = {
  ORDER_NOT_SUBMITTABLE: "완료 등록할 수 없는 상태입니다.",
  INSTALL_END_REQUIRED: "설치 종료 일시를 입력해 주세요.",
  PHOTO_COUNT_INVALID: "사진을 1~4장 첨부해 주세요.",
  INVALID_CAPABILITY: "연동 등급을 확인해 주세요.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

// Downscale + re-encode to keep the upload well under the Server Action /
// Vercel body limits (phone photos are several MB each).
async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7),
    );
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function CompleteClient({
  orderId,
  erpOrderNo,
  address,
}: {
  orderId: string;
  erpOrderNo: string;
  address: string;
}) {
  const router = useRouter();
  const [capability, setCapability] = useState<string>("NONE");
  const [wallpadLinked, setWallpadLinked] = useState(false);
  const [wallpadAmount, setWallpadAmount] = useState("");
  const [longDistanceAmount, setLongDistanceAmount] = useState("");
  const [installEndAt, setInstallEndAt] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);

  const hasLinkage = capability !== "NONE";
  const canSubmit =
    installEndAt.length > 0 && photos.length >= 1 && photos.length <= 4 && !busy && !compressing;

  async function addPhotos(list: FileList | null) {
    if (!list) return;
    setCompressing(true);
    const incoming = Array.from(list).slice(0, 4 - photos.length);
    const compressed = await Promise.all(incoming.map(compressImage));
    setPhotos((prev) => [...prev, ...compressed].slice(0, 4));
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
          longDistanceAmount: toNumberOrNull(longDistanceAmount),
          wallpadAmount: toNumberOrNull(wallpadAmount),
          installEndAt,
        });

    setPreview(result);
    setBusy(false);
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);

    const amount = wallpadAmount.replace(/[^\d]/g, "");
    const longDistance = longDistanceAmount.replace(/[^\d]/g, "");
    const entry: QueuedCompletionInput = {
      orderId,
      capability,
      wallpadLinked,
      wallpadAmount: amount ? Number(amount) : null,
      longDistanceAmount: longDistance ? Number(longDistance) : null,
      installEndAt,
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
          <div style={ui.label}>연동 등급</div>
          {CAPABILITIES.map((c) => (
            <label key={c.value} style={radioRow}>
              <input
                type="radio"
                name="capability"
                checked={capability === c.value}
                onChange={() => setCapability(c.value)}
              />
              <span>{c.label}</span>
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
            <input
              style={{ ...ui.input, marginTop: 10 }}
              value={wallpadAmount}
              onChange={(e) => setWallpadAmount(e.target.value)}
              inputMode="numeric"
              placeholder="현장 금액 (원, 선택)"
            />
          ) : null}
        </div>

        <div style={ui.card}>
          <label style={ui.label}>장거리 비용 (선택)</label>
          <input
            style={ui.input}
            value={longDistanceAmount}
            onChange={(e) => setLongDistanceAmount(e.target.value)}
            inputMode="numeric"
            placeholder="장거리 금액 (원, 관리자 확인 후 정산)"
          />
        </div>

        <div style={ui.card}>
          <label style={ui.label}>설치 종료 일시 (필수)</label>
          <input
            style={ui.input}
            type="datetime-local"
            value={installEndAt}
            onChange={(e) => setInstallEndAt(e.target.value)}
          />
        </div>

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
    { label: "야간/휴일", value: preview.nightWeekendFee },
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

const radioRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 15 };
const checkRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontSize: 15 };


