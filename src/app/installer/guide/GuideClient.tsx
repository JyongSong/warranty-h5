"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { markInstallerGuideSeen } from "../guideSeen";
import * as ui from "../ui";

/**
 * 기사 앱 사용 안내.
 *
 * 요소마다 말풍선을 띄우는 방식(coach mark) 대신 전면 카드로 넘긴다. 탭 4개에
 * 흐름도 단순해서 위치 계산·스크롤 대응을 감당할 만한 이득이 없다.
 *
 * 내용은 기능 나열이 아니라 "실제로 어긋나는 지점" 순서다: 응답 기한, 해피콜,
 * 사진 필수, 정산이 잡히는 시점.
 */

const warnLine: CSSProperties = { color: "#92400e", fontWeight: 700, margin: 0 };
const mutedLine: CSSProperties = { color: "#a1a1aa", fontSize: 13, margin: 0 };

type Slide = {
  icon: string;
  title: string;
  body: ReactNode;
};

const SLIDES: Slide[] = [
  {
    icon: "🔧",
    title: "새 작업은 [설치] 탭에서",
    body: (
      <>
        <p>새 배정이 오면 앱 알림 또는 문자로 안내드립니다.</p>
        <p style={warnLine}>
          24시간 안에 수락 또는 거절하지 않으면 다른 기사님께 배정됩니다.
        </p>
        <p>탭 아이콘의 빨간 숫자가 지금 처리할 건수입니다.</p>
      </>
    ),
  },
  {
    icon: "📞",
    title: "수락하면 고객 정보가 열립니다",
    body: (
      <>
        <p>수락 전에는 고객 성함·연락처가 가려져 있습니다.</p>
        <p>
          작업 상세의 연락처 옆 <strong>통화</strong> 버튼을 누르면 바로 전화가
          걸립니다.
        </p>
        <p style={warnLine}>수락 후 48시간 안에 확인 전화를 부탁드립니다.</p>
      </>
    ),
  },
  {
    icon: "📷",
    title: "작업이 끝나면 완료 등록",
    body: (
      <>
        <p style={warnLine}>사진 1~4장이 반드시 필요합니다.</p>
        <p>현장에서 촬영하거나 앨범에서 고를 수 있습니다.</p>
        <p>
          제출 직전에 정산 금액이 표시됩니다. 금액을 확인하고 제출해 주세요.
        </p>
      </>
    ),
  },
  {
    icon: "📄",
    title: "정산은 [이력·정산] 탭에서",
    body: (
      <>
        <p>이번 달 정산 금액이 가장 위에 표시됩니다. 좌우 화살표로 지난달을 볼 수 있습니다.</p>
        <p>
          완료 등록 후 본사 승인 전까지는 <strong>검수 대기</strong>로 표시되며,
          승인되면 금액이 확정되어 목록에 올라옵니다.
        </p>
        <p style={mutedLine}>
          월패드 현장 수금은 기사님이 직접 받으신 금액이라 정산 금액에 포함되지
          않습니다.
        </p>
      </>
    ),
  },
];

export default function GuideClient({ mode }: { mode: "first-visit" | "revisit" }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  function finish() {
    markInstallerGuideSeen();
    // 처음 보는 경우엔 원래 가려던 목록으로, 다시 보기면 왔던 화면으로.
    if (mode === "first-visit") router.replace("/installer");
    else router.back();
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={topRow}>
          <span style={{ fontSize: 13, color: "#a1a1aa", fontWeight: 700 }}>
            {index + 1} / {SLIDES.length}
          </span>
          <button type="button" onClick={finish} style={skipButton}>
            {mode === "first-visit" ? "건너뛰기" : "닫기"}
          </button>
        </div>

        <div style={{ ...ui.card, padding: "28px 20px", minHeight: 300 }}>
          <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 14 }} aria-hidden>
            {slide.icon}
          </div>
          <h1 style={{ ...ui.h1, fontSize: 20, marginBottom: 12 }}>{slide.title}</h1>
          <div style={bodyStyle}>{slide.body}</div>
        </div>

        <div style={dots} aria-hidden>
          {SLIDES.map((item, i) => (
            <span
              key={item.title}
              style={{ ...dot, background: i === index ? "#111" : "#d4d4d8" }}
            />
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            style={ui.primaryButton(false)}
            onClick={() => (isLast ? finish() : setIndex((v) => v + 1))}
          >
            {isLast ? "시작하기" : "다음"}
          </button>
          {index > 0 ? (
            <>
              <div style={{ height: 8 }} />
              <button type="button" style={ui.secondaryButton} onClick={() => setIndex((v) => v - 1)}>
                이전
              </button>
            </>
          ) : null}
        </div>

        <p style={footNote}>이 안내는 [내 정보]에서 언제든 다시 볼 수 있습니다.</p>
      </div>
    </main>
  );
}

const topRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const skipButton: CSSProperties = {
  minHeight: 36,
  padding: "0 10px",
  border: "none",
  background: "none",
  color: "#71717a",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const bodyStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: "#3f3f46",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const dots: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 6,
  marginTop: 16,
};

const dot: CSSProperties = { width: 7, height: 7, borderRadius: 999, display: "block" };

const footNote: CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  textAlign: "center",
  marginTop: 16,
  lineHeight: 1.6,
};
