import type { Metadata } from "next";
import { CHAPTERS, pad2 } from "./chapters";

export const metadata: Metadata = {
  title: "Aqara 도어락 · M200 허브 설치 가이드",
  description:
    "Aqara 스마트 도어락 L100 + M200 허브 설치 단계별 가이드 (기사님용)",
};

// sticky 점프바 라벨
const NAV_LABELS: Record<string, string> = {
  ch1: "1. 도어락 등록",
  ch2: "2. 허브 등록",
  ch3: "3. 연결",
};

export default function InstallGuidePage() {
  return (
    <div style={pageStyle}>
      {/* sticky 점프바: 페이지 맨 위 고정. 챕터 anchor 로 점프. */}
      <nav style={stickyNavStyle} aria-label="챕터 바로가기">
        <div style={stickyNavInnerStyle}>
          {CHAPTERS.map((ch) => (
            <a
              key={ch.id}
              href={`#${ch.id}`}
              style={stickyLinkStyle}
            >
              {NAV_LABELS[ch.id] ?? ch.title}
            </a>
          ))}
        </div>
      </nav>

      {/* 표지 헤더 */}
      <header style={headerStyle}>
        <div style={headerInnerStyle}>
          <p style={badgeStyle}>INSTALLER GUIDE</p>
          <h1 style={titleStyle}>
            Aqara 스마트 도어락 L100
            <br />
            설치 · 설정 가이드
          </h1>
          <p style={subtitleStyle}>
            Aqara Home App · M200 Hub · L100 Door Lock
          </p>
        </div>
      </header>

      <main style={mainStyle}>
        {CHAPTERS.map((ch) => (
          <section key={ch.id} id={ch.id} style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={{ ...chapterBadgeStyle, background: ch.accent }}>
                CHAPTER {ch.number}
              </span>
              <h2 style={sectionTitleStyle}>{ch.title}</h2>
              {ch.stepCount && (
                <p style={sectionMetaStyle}>{ch.stepCount} 단계</p>
              )}
            </div>

            <div style={slidesGridStyle}>
              {ch.slides.map((n) => (
                <figure key={n} id={`slide-${n}`} style={figureStyle}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/install-guide/slide-${pad2(n)}.jpg`}
                    alt={`${ch.title} 슬라이드 ${n}`}
                    loading="lazy"
                    decoding="async"
                    style={imageStyle}
                  />
                </figure>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

const BRAND = "#1d3129";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#fafaf9",
  color: "#18181b",
};

// === sticky 점프바 ===

const stickyNavStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  background: BRAND,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  // safe-area for iPhone notch / browser bar
  boxShadow: "0 1px 0 rgba(0,0,0,0.08), 0 8px 24px -16px rgba(0,0,0,0.3)",
};

const stickyNavInnerStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  display: "flex",
  gap: 6,
  overflowX: "auto",
  padding: "10px 12px",
  scrollbarWidth: "none",
  WebkitOverflowScrolling: "touch",
};

const stickyLinkStyle: React.CSSProperties = {
  flexShrink: 0,
  color: "#fff",
  textDecoration: "none",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

// === 표지 헤더 ===

const headerStyle: React.CSSProperties = {
  background: BRAND,
  color: "#fff",
};

const headerInnerStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "32px 24px 40px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 11,
  letterSpacing: "0.18em",
  fontWeight: 600,
  marginBottom: 16,
  marginTop: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.3,
  marginTop: 0,
  marginBottom: 12,
};

const subtitleStyle: React.CSSProperties = {
  opacity: 0.8,
  fontSize: 14,
  margin: 0,
};

// === main ===

const mainStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "32px 16px 64px",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 48,
  // sticky 점프바 (약 50px) 아래로 anchor 가 들어가지 않게 여유 확보
  scrollMarginTop: 64,
};

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 18,
};

const chapterBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.16em",
  padding: "4px 10px",
  borderRadius: 6,
  marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  margin: "0 0 4px",
  color: "#18181b",
};

const sectionMetaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#71717a",
  margin: 0,
};

const slidesGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
};

const figureStyle: React.CSSProperties = {
  margin: 0,
  background: "#fff",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
  scrollMarginTop: 64,
};

const imageStyle: React.CSSProperties = {
  width: "100%",
  height: "auto",
  display: "block",
};
