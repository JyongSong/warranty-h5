"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { markInstallerGuideSeen } from "../guideSeen";
import { TabPointer } from "../InstallerNav";
import GuideArrow, { guideRing } from "./GuideArrow";
import * as ui from "../ui";

/**
 * 기사 앱 사용 안내.
 *
 * 전면 카드로 넘기되, 장마다 "어디를 누르는지"를 화살표로 짚는다. 탭 이야기는
 * 화면 아래 실제 탭을, 작업 상세·완료 등록 이야기는 카드 안의 화면 예시를
 * 가리킨다 — 처음 로그인한 기사에게는 배정이 없어 실제 상세 화면을 띄울 수 없다.
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
  /** 화살표로 가리킬 하단 탭 (InstallerNav 의 href) */
  tab?: string;
  /** 탭이 아닌 화면 속 버튼을 가리킬 때 보여 줄 화면 예시 */
  demo?: ReactNode;
};

function Demo({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={demoBox} aria-hidden>
      <div style={demoCaption}>{caption}</div>
      {children}
    </div>
  );
}

function CallDemo() {
  return (
    <Demo caption="작업 상세 화면 예시">
      <div style={demoRow}>
        <span style={ui.rowLabel}>고객명</span>
        <span style={ui.rowValue}>홍길동</span>
      </div>
      <div style={demoRow}>
        <span style={ui.rowLabel}>연락처</span>
        <span style={ui.rowValue}>010-0000-0000</span>
        <span style={{ position: "relative" }}>
          <span style={{ ...demoCallButton, ...guideRing, borderRadius: 999 }}>📞 통화</span>
          <span style={demoArrowBelow}>
            <GuideArrow direction="up" />
          </span>
        </span>
      </div>
    </Demo>
  );
}

function PhotoDemo() {
  return (
    <Demo caption="완료 등록 화면 예시">
      <div style={{ ...ui.rowLabel, marginBottom: 8 }}>사진 (1~4장)</div>
      <div style={{ position: "relative" }}>
        <div style={{ ...demoPhotoButtons, ...guideRing }}>
          <span style={demoGhostButton}>📷 촬영</span>
          <span style={demoGhostButton}>🖼 앨범에서 선택</span>
        </div>
        <span style={demoArrowBelow}>
          <GuideArrow direction="up" />
        </span>
      </div>
    </Demo>
  );
}

const SLIDES: Slide[] = [
  {
    icon: "🔧",
    title: "새 작업은 [설치] 탭에서",
    tab: "/installer",
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
    demo: <CallDemo />,
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
    demo: <PhotoDemo />,
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
    tab: "/installer/history",
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
          {slide.demo}
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
      {slide.tab ? <TabPointer href={slide.tab} /> : null}
    </main>
  );
}

const demoBox: CSSProperties = {
  marginTop: 16,
  // 아래쪽은 위를 가리키는 화살표가 들어갈 자리.
  padding: "12px 14px 50px",
  border: `1px solid ${ui.BORDER}`,
  borderRadius: 12,
  background: "#fafafa",
};

const demoCaption: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#a1a1aa", marginBottom: 8 };

const demoRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "56px 1fr auto",
  alignItems: "center",
  gap: 8,
  padding: "5px 0",
};

const demoCallButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 36,
  padding: "0 12px",
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const demoPhotoButtons: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };

const demoGhostButton: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: ui.TEXT,
  fontSize: 13,
  fontWeight: 700,
};

const demoArrowBelow: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  paddingTop: 8,
};

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
