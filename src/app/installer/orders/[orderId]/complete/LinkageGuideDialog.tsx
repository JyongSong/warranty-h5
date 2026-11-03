"use client";

import type { CSSProperties } from "react";
import * as ui from "../../../ui";

export type LinkageCapability = "DOORLOCK_AND_APP" | "DOORLOCK_AND_APP_AND_HUB";

// 어떤 화면을 올려야 연동비가 승인되는지. 기사가 헷갈려 엉뚱한 화면을 올리는 일이 잦아
// 연동을 고르는 순간 띄운다. 두 등급을 나란히 보여 줘서 어느 쪽에 해당하는지 비교하게 한다.
// 예시는 Aqara Home 앱의 도어락 화면이고, 둘의 차이는 가운데 허브 아이콘이 켜져 있는지다.
const GUIDES: Array<{
  value: LinkageCapability;
  title: string;
  image: string;
  caption: string;
  /** 예시 이미지에서 짚어 줄 영역(이미지 대비 %). */
  highlight?: { left: number; top: number; width: number; height: number };
}> = [
  {
    value: "DOORLOCK_AND_APP",
    title: "APP만 연동",
    image: "/images/installer/linkage-guide-app.png",
    caption: "앱의 도어락 화면",
  },
  {
    value: "DOORLOCK_AND_APP_AND_HUB",
    title: "허브와 연동",
    image: "/images/installer/linkage-guide-hub.png",
    caption: "허브 아이콘이 켜진 화면",
    highlight: { left: 34.5, top: 35.5, width: 31, height: 9.5 },
  },
];

export default function LinkageGuideDialog({
  selected,
  fees,
  onClose,
}: {
  /** 방금 고른 등급. null 이면 닫혀 있다. */
  selected: LinkageCapability | null;
  fees: Record<LinkageCapability, number>;
  onClose: () => void;
}) {
  if (!selected) return null;

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label="연동 사진 안내" onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>어떤 화면을 올려야 하나요?</div>
        <div style={{ fontSize: 13, color: "#71717a", margin: "4px 0 14px", lineHeight: 1.5 }}>
          아래 예시처럼 앱의 도어락 화면을 올려 주세요.
        </div>

        <div style={guideGrid}>
          {GUIDES.map((g) => {
            const active = g.value === selected;
            return (
              <div key={g.value} style={guideBox(active)}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{g.title}</div>
                <div style={{ fontSize: 15, fontWeight: 800, margin: "2px 0 8px" }}>
                  {fees[g.value] > 0 ? `+${fees[g.value].toLocaleString()}원` : "\u00a0"}
                  {active ? <span style={selectedTag}>선택함</span> : null}
                </div>
                <div style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.image} alt={`${g.title} 예시 화면`} style={exampleImage} />
                  {g.highlight ? (
                    <div
                      style={{
                        ...highlightBox,
                        left: `${g.highlight.left}%`,
                        top: `${g.highlight.top}%`,
                        width: `${g.highlight.width}%`,
                        height: `${g.highlight.height}%`,
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: g.highlight ? "#b42318" : "#3f3f46", marginTop: 6, lineHeight: 1.4 }}>
                  {g.caption}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 13, color: "#b42318", fontWeight: 700, lineHeight: 1.5, marginTop: 12 }}>
          가운데 허브 아이콘이 켜져 있어야 허브 연동으로 승인됩니다. (본사 승인 기준)
        </div>
        <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.5, marginTop: 4 }}>
          화면 캡처를 올리거나, 휴대폰 화면을 촬영해 주세요.
        </div>

        <div style={{ marginTop: 16 }}>
          <button style={ui.primaryButton(false)} onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 100,
};

const sheet: CSSProperties = {
  width: "100%",
  maxWidth: 460,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: "16px 16px 0 0",
  padding: "22px 18px calc(22px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const guideGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

function guideBox(active: boolean): CSSProperties {
  return {
    border: active ? "2px solid #111" : `1px solid ${ui.BORDER}`,
    background: active ? "#fafafa" : "#fff",
    borderRadius: 12,
    padding: active ? 9 : 10,
    minWidth: 0,
  };
}

const exampleImage: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  borderRadius: 8,
  border: `1px solid ${ui.BORDER}`,
};

const highlightBox: CSSProperties = {
  position: "absolute",
  border: "3px solid #e5281e",
  borderRadius: 8,
  pointerEvents: "none",
};

const selectedTag: CSSProperties = {
  marginLeft: 6,
  fontSize: 11,
  fontWeight: 700,
  color: "#fff",
  background: "#111",
  borderRadius: 999,
  padding: "2px 7px",
  verticalAlign: "middle",
};
