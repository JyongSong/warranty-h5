import type { CSSProperties } from "react";

/**
 * 안내 화면에서 "여기를 누르세요"를 가리키는 화살표.
 *
 * 바깥 span 이 방향(회전)을, 안쪽 span 이 까딱이는 움직임을 맡는다. 둘을 한
 * 요소에 두면 애니메이션의 transform 이 회전을 덮어쓴다.
 */
export const GUIDE_ACCENT = "#ef4444";

export default function GuideArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <span style={{ ...outer, transform: direction === "up" ? "rotate(180deg)" : undefined }} aria-hidden>
      <style>{KEYFRAMES}</style>
      <span className="installer-guide-arrow" style={inner}>
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 4v26M4 20l10 12 10-12" stroke="#fff" strokeWidth="8" />
          <path d="M14 4v26M4 20l10 12 10-12" stroke={GUIDE_ACCENT} strokeWidth="4.5" />
        </svg>
      </span>
    </span>
  );
}

/** 화살표가 가리키는 대상을 두르는 테두리. */
export const guideRing: CSSProperties = {
  outline: `2px solid ${GUIDE_ACCENT}`,
  outlineOffset: 3,
  borderRadius: 12,
};

const KEYFRAMES = `
@keyframes installer-guide-arrow-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.installer-guide-arrow { animation: installer-guide-arrow-bob 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .installer-guide-arrow { animation: none; } }
`;

const outer: CSSProperties = { display: "inline-flex", lineHeight: 0 };
const inner: CSSProperties = { display: "inline-flex" };
