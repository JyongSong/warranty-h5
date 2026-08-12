"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { submitCompletionAction } from "./actions";
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
  const [installEndAt, setInstallEndAt] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLinkage = capability !== "NONE";
  const canSubmit = installEndAt.length > 0 && photos.length >= 1 && photos.length <= 4 && !busy;

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const next = [...photos, ...Array.from(list)].slice(0, 4);
    setPhotos(next);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("capability", capability);
    fd.set("wallpadLinked", String(wallpadLinked));
    fd.set("wallpadAmount", wallpadAmount);
    fd.set("installEndAt", installEndAt);
    photos.forEach((p) => fd.append("photos", p));

    const res = await submitCompletionAction(fd);
    setBusy(false);
    if (res.ok) router.push("/installer");
    else setError(ERR[res.error] ?? ERR.DEFAULT);
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
          <label style={ui.label}>설치 종료 일시 (필수)</label>
          <input
            style={ui.input}
            type="datetime-local"
            value={installEndAt}
            onChange={(e) => setInstallEndAt(e.target.value)}
          />
        </div>

        <div style={ui.card}>
          <div style={ui.label}>사진 (1~4장)</div>
          <label style={fileBtn}>
            사진 촬영/선택
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: "none" }}
              onChange={(e) => addPhotos(e.target.files)}
            />
          </label>
          {photos.length > 0 ? (
            <div style={thumbRow}>
              {photos.map((p, i) => (
                <div key={i} style={thumbWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(p)} alt="" style={thumb} />
                  <button style={removeBtn} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6 }}>{photos.length}/4</div>
        </div>

        {error ? <div style={ui.errorText}>{error}</div> : null}

        <div style={{ marginTop: 8 }}>
          <button style={ui.primaryButton(!canSubmit)} disabled={!canSubmit} onClick={submit}>
            {busy ? "제출 중…" : "완료 제출"}
          </button>
        </div>
      </div>
    </main>
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

const fileBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 50,
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const thumbRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 };
const thumbWrap: CSSProperties = { position: "relative", width: 72, height: 72 };
const thumb: CSSProperties = { width: 72, height: 72, objectFit: "cover", borderRadius: 8 };
const removeBtn: CSSProperties = {
  position: "absolute",
  top: -6,
  right: -6,
  width: 22,
  height: 22,
  borderRadius: "50%",
  border: "none",
  background: "#18181b",
  color: "#fff",
  fontSize: 12,
  cursor: "pointer",
};
