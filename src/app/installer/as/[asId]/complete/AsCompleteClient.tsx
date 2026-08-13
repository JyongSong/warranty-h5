"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import { getAsUploadTargetsAction, submitAsCompletionAction } from "./actions";
import * as ui from "../../../ui";

let supabaseBrowser: ReturnType<typeof createClient> | null = null;
function getSupabaseBrowser() {
  if (!supabaseBrowser) {
    supabaseBrowser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    );
  }
  return supabaseBrowser;
}

async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    return blob ? new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const ERR: Record<string, string> = {
  AS_ORDER_NOT_SUBMITTABLE: "완료 등록할 수 없는 상태입니다.",
  RESOLUTION_DETAIL_REQUIRED: "처리 내용을 입력해 주세요.",
  PHOTO_COUNT_INVALID: "사진은 최대 4장입니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

export default function AsCompleteClient({
  asOrderId,
  symptomLabel,
}: {
  asOrderId: string;
  symptomLabel: string;
}) {
  const router = useRouter();
  const [resolutionDetail, setResolutionDetail] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = resolutionDetail.trim().length > 0 && !busy && !compressing;

  async function addPhotos(list: FileList | null) {
    if (!list) return;
    setCompressing(true);
    const incoming = Array.from(list).slice(0, 4 - photos.length);
    const compressed = await Promise.all(incoming.map(compressImage));
    setPhotos((prev) => [...prev, ...compressed].slice(0, 4));
    setCompressing(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const fee = serviceFee.replace(/[^\d]/g, "");
      const photoPaths: string[] = [];
      if (photos.length > 0) {
        const targetsRes = await getAsUploadTargetsAction(asOrderId, photos.length);
        if (!targetsRes.ok) {
          setError(ERR[targetsRes.error] ?? ERR.DEFAULT);
          return;
        }
        const supabase = getSupabaseBrowser();
        for (let i = 0; i < photos.length; i++) {
          const t = targetsRes.targets[i];
          const up = await supabase.storage.from(targetsRes.bucket).uploadToSignedUrl(t.path, t.token, photos[i]);
          if (up.error) throw up.error;
          photoPaths.push(t.path);
        }
      }

      const res = await submitAsCompletionAction({
        asOrderId,
        resolutionDetail,
        serviceFee: fee ? Number(fee) : null,
        photoPaths,
      });
      if (res.ok) router.push("/installer");
      else setError(ERR[res.error] ?? ERR.DEFAULT);
    } catch {
      setError("사진 업로드에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <button style={backLink} onClick={() => router.push(`/installer/as/${asOrderId}`)}>
          ← 취소
        </button>
        <h1 style={ui.h1}>A/S 처리 완료</h1>
        <p style={ui.sub}>{symptomLabel}</p>

        <div style={ui.card}>
          <label style={ui.label}>처리 내용 (필수)</label>
          <textarea
            style={{ ...ui.input, minHeight: 96, padding: 12 }}
            value={resolutionDetail}
            onChange={(e) => setResolutionDetail(e.target.value)}
            placeholder="어떻게 처리했는지 입력해 주세요."
          />
        </div>

        <div style={ui.card}>
          <label style={ui.label}>용역비 (원, 선택 · 관리자 승인)</label>
          <input
            style={ui.input}
            value={serviceFee}
            onChange={(e) => setServiceFee(e.target.value)}
            inputMode="numeric"
            placeholder="예: 30000"
          />
        </div>

        <div style={ui.card}>
          <div style={ui.label}>사진 (선택, 최대 4장)</div>
          <label style={fileBtn}>
            {compressing ? "처리 중…" : "사진 촬영/선택"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={compressing || photos.length >= 4}
              style={{ display: "none" }}
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
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
