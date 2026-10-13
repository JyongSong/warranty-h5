"use client";

import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import * as ui from "./ui";

/**
 * 완료 등록용 사진 첨부. 설치·A/S 양쪽이 같은 UI 를 쓴다.
 *
 * embedded 는 다른 카드 안에 딸린 첨부(예: 기타 청구 증빙)에 쓴다. 테두리 버튼으로
 * 그려서 화면의 주 사진 첨부와 한눈에 구분되게 한다.
 *
 * 촬영과 앨범을 버튼으로 나눈 이유: 하나의 input 에 capture 를 걸면 카메라만
 * 열리고, capture 를 빼면 기기·안드로이드 버전마다 선택창에 카메라가 있을
 * 때도 없을 때도 있다. 두 경로를 각각 보장하려면 input 을 나누는 편이 확실하다.
 */
export default function PhotoPicker({
  label,
  photos,
  max = 4,
  embedded = false,
  busy,
  onAdd,
  onRemove,
}: {
  label: string;
  photos: File[];
  max?: number;
  embedded?: boolean;
  busy: boolean;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  const full = photos.length >= max;
  const disabled = busy || full;

  return (
    <div style={embedded ? embeddedWrap : ui.card}>
      <div style={embedded ? embeddedLabel : ui.label}>{label}</div>

      <div style={buttonRow}>
        <PickButton
          text="📷 촬영"
          capture
          outline={embedded}
          disabled={disabled}
          busy={busy}
          onPick={onAdd}
        />
        <PickButton
          text="🖼 앨범에서 선택"
          capture={false}
          outline={embedded}
          disabled={disabled}
          busy={busy}
          onPick={onAdd}
        />
      </div>

      {photos.length > 0 ? (
        <div style={thumbRow}>
          {photos.map((photo, index) => (
            <Thumb key={`${photo.name}-${index}`} file={photo} onRemove={() => onRemove(index)} />
          ))}
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: full ? "#92400e" : "#a1a1aa", marginTop: 6 }}>
        {photos.length}/{max}
        {full ? " · 더 담으려면 먼저 지워 주세요" : ""}
      </div>
    </div>
  );
}

function PickButton({
  text,
  capture,
  outline,
  disabled,
  busy,
  onPick,
}: {
  text: string;
  capture: boolean;
  outline: boolean;
  disabled: boolean;
  busy: boolean;
  onPick: (files: FileList | null) => void;
}) {
  return (
    <label
      style={{
        ...pickButton,
        ...(outline ? pickButtonOutline : null),
        ...(disabled ? (outline ? pickButtonOutlineDisabled : pickButtonDisabled) : null),
      }}
    >
      {busy ? "처리 중…" : text}
      <input
        type="file"
        accept="image/*"
        // 촬영 버튼만 카메라로 직행한다. 앨범 버튼은 capture 를 주지 않아
        // 기기의 사진 선택기가 열린다.
        {...(capture ? { capture: "environment" as const } : null)}
        multiple
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(event) => {
          onPick(event.target.files);
          // 같은 파일을 연속으로 고를 수 있게 비운다.
          event.target.value = "";
        }}
      />
    </label>
  );
}

function Thumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  // 렌더마다 새 URL 을 만들고 놓아두면 메모리가 샌다.
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div style={thumbWrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={thumb} />
      <button type="button" style={removeBtn} onClick={onRemove} aria-label="사진 삭제">
        ✕
      </button>
    </div>
  );
}

const buttonRow: CSSProperties = { display: "flex", gap: 8 };

const pickButton: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  minHeight: 50,
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const pickButtonDisabled: CSSProperties = {
  background: "#a1a1aa",
  borderColor: "#a1a1aa",
  cursor: "not-allowed",
};

const pickButtonOutline: CSSProperties = {
  minHeight: 44,
  background: "#fff",
  color: "#111",
  borderColor: "#d4d4d8",
  fontWeight: 600,
};

const pickButtonOutlineDisabled: CSSProperties = { color: "#a1a1aa", cursor: "not-allowed" };

const embeddedWrap: CSSProperties = { marginTop: 14, paddingTop: 14, borderTop: "1px dashed #e4e4e7" };
const embeddedLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#52525b", marginBottom: 8 };

const thumbRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 };

const thumbWrap: CSSProperties = { position: "relative" };

const thumb: CSSProperties = {
  width: 72,
  height: 72,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  display: "block",
};

const removeBtn: CSSProperties = {
  position: "absolute",
  top: -6,
  right: -6,
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "none",
  background: "#111",
  color: "#fff",
  fontSize: 12,
  lineHeight: "22px",
  padding: 0,
  cursor: "pointer",
};
