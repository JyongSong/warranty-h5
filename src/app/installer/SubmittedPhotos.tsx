"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { CompletionPhoto } from "@/lib/installer/storage";

// 제출한 사진 썸네일 + 눌러서 크게 보기. URL 은 서버에서 만든 서명 URL(30분)이라
// 화면을 오래 열어 두면 만료된다 — 그때는 새로고침하면 다시 보인다.
// 새 창으로 열면 앱(WebView)에서 외부 브라우저로 빠지므로 화면 안에서 띄운다.
export default function SubmittedPhotos({ title, photos }: { title: string; photos: CompletionPhoto[] }) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  if (photos.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={titleStyle}>
        {title} · {photos.length}장
      </div>
      <div style={row}>
        {photos.map((p, i) =>
          p.url ? (
            <button
              key={p.path}
              type="button"
              style={thumbButton}
              onClick={() => setOpenUrl(p.url)}
              aria-label={`${title} ${i + 1} 크게 보기`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`${title} ${i + 1}`} style={thumb} />
            </button>
          ) : (
            <div key={p.path} style={missing}>
              불러올 수 없음
            </div>
          ),
        )}
      </div>

      {openUrl ? (
        <div style={backdrop} role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpenUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openUrl} alt={title} style={full} />
          <button type="button" style={closeButton} onClick={() => setOpenUrl(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </div>
  );
}

const titleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#52525b", marginBottom: 6 };

const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const thumbButton: CSSProperties = { padding: 0, border: "none", background: "none", cursor: "pointer" };

const thumb: CSSProperties = {
  width: 84,
  height: 84,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  display: "block",
};

const missing: CSSProperties = {
  width: 84,
  height: 84,
  borderRadius: 8,
  border: "1px dashed #d4d4d8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  color: "#a1a1aa",
  textAlign: "center",
};

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.88)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: 16,
  zIndex: 200,
};

const full: CSSProperties = { maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 6 };

const closeButton: CSSProperties = {
  minHeight: 44,
  minWidth: 120,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.5)",
  background: "transparent",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
};
