import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aqara 스마트홈 설정 가이드",
  description: "Aqara 스마트홈 설정 동영상 및 사용 설명서",
};

// TODO: 사용자가 YouTube URL 과 설명서를 제공하면 placeholder 를 교체.
// 1) VIDEOS 배열에 { id, title, desc } 추가
// 2) MANUAL_*  관련 영역에 PDF / 이미지 삽입

type Video = {
  /** YouTube video ID (즉 https://youtu.be/<id> 의 <id> 부분) */
  id: string;
  title: string;
  desc?: string;
};

const VIDEOS: Video[] = [
  // 예시:
  // { id: "dQw4w9WgXcQ", title: "Aqara Home 앱 설치", desc: "앱 설치부터 회원가입까지" },
];

export default function SmarthomeSettingGuidePage() {
  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={headerInnerStyle}>
          <p style={badgeStyle}>USER GUIDE</p>
          <h1 style={titleStyle}>스마트홈 설정 가이드</h1>
          <p style={subtitleStyle}>
            동영상과 사용 설명서로 Aqara 스마트홈을 손쉽게 설정하세요.
          </p>
        </div>
      </header>

      <main style={mainStyle}>
        {/* === Section 1: 영상 가이드 === */}
        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabelStyle}>SECTION 01</span>
            <h2 style={sectionTitleStyle}>영상 가이드</h2>
          </div>

          {VIDEOS.length === 0 ? (
            <div style={placeholderStyle}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>▶️</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                동영상 준비 중입니다
              </div>
              <p style={placeholderHintStyle}>
                곧 단계별 동영상이 업데이트됩니다.
              </p>
            </div>
          ) : (
            <div style={videoGridStyle}>
              {VIDEOS.map((v) => (
                <article key={v.id} style={videoCardStyle}>
                  <div style={videoEmbedWrapperStyle}>
                    <iframe
                      style={videoIframeStyle}
                      src={`https://www.youtube.com/embed/${v.id}`}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <h3 style={videoTitleStyle}>{v.title}</h3>
                  {v.desc && <p style={videoDescStyle}>{v.desc}</p>}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* === Section 2: 사용 설명서 === */}
        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabelStyle}>SECTION 02</span>
            <h2 style={sectionTitleStyle}>사용 설명서</h2>
          </div>

          {/* TODO: PDF / 이미지가 준비되면 여기 교체 */}
          <div style={placeholderStyle}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📘</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              사용 설명서 준비 중입니다
            </div>
            <p style={placeholderHintStyle}>
              곧 PDF 또는 이미지 형태로 업데이트됩니다.
            </p>
          </div>
        </section>
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

const headerStyle: React.CSSProperties = {
  background: BRAND,
  color: "#fff",
};

const headerInnerStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "40px 24px",
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
  opacity: 0.85,
  fontSize: 14,
  margin: 0,
  lineHeight: 1.5,
};

const mainStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "32px 16px 64px",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 48,
};

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 18,
};

const sectionLabelStyle: React.CSSProperties = {
  display: "inline-block",
  color: BRAND,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.2em",
  marginBottom: 6,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
  color: "#18181b",
};

const placeholderStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px dashed #d4d4d8",
  borderRadius: 14,
  padding: "40px 24px",
  textAlign: "center",
  color: "#52525b",
};

const placeholderHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  marginTop: 8,
  marginBottom: 0,
};

const videoGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 20,
};

const videoCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 6px 20px rgba(0,0,0,0.04)",
};

const videoEmbedWrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  paddingTop: "56.25%", // 16:9
  background: "#000",
};

const videoIframeStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  border: 0,
};

const videoTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: "14px 18px 4px",
};

const videoDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#71717a",
  margin: "0 18px 18px",
  lineHeight: 1.5,
};
