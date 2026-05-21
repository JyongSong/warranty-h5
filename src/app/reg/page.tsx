export const dynamic = "force-dynamic";

// TODO: reg-success-user-sms PR 머지 후 아래 두 줄 복원, 점검 페이지 제거.
// import RegClient from "./RegClient";

export default async function Page() {
  return (
    <div style={containerStyle}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🛠️</div>
      <h1 style={titleStyle}>점검 중입니다</h1>
      <p style={textStyle}>
        설치정보 등록 페이지가 일시적으로 점검 중입니다.
        <br />
        잠시 후 다시 이용해 주세요.
      </p>
      <p style={contactStyle}>
        문의:{" "}
        <a
          href="https://o8znz.channel.io"
          style={{ color: "#1d3129" }}
          target="_blank"
          rel="noreferrer"
        >
          o8znz.channel.io
        </a>
      </p>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: "60px auto",
  padding: 24,
  textAlign: "center",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 12,
  color: "#18181b",
};

const textStyle: React.CSSProperties = {
  color: "#52525b",
  lineHeight: 1.6,
  fontSize: 15,
};

const contactStyle: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: 13,
  marginTop: 32,
};
