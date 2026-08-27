"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { partnerLoginAction } from "../actions";

export default function PartnerLoginClient() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setMessage(null);

    // 성공하면 서버 액션이 redirect 하므로 여기로 돌아오지 않는다.
    const result = await partnerLoginAction(formData);
    setPending(false);
    if (result && !result.ok) {
      setMessage(result.message);
    }
  }

  return (
    <div style={pageStyle}>
      <form action={handleSubmit} style={cardStyle}>
        <p style={eyebrowStyle}>PARTNER</p>
        <h1 style={titleStyle}>주문번호 명단 업로드</h1>
        <p style={subtitleStyle}>CJ 담당자 전용 페이지입니다.</p>

        <label style={labelStyle}>
          아이디
          <input name="loginId" style={inputStyle} autoComplete="username" required />
        </label>
        <label style={labelStyle}>
          비밀번호
          <input
            name="password"
            type="password"
            style={inputStyle}
            autoComplete="current-password"
            required
          />
        </label>

        {message ? <p style={errorStyle}>{message}</p> : null}

        <button type="submit" disabled={pending} style={submitStyle(pending)}>
          {pending ? "확인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}

const PURPLE = "#7C3AED";
const BORDER = "#E5E7EB";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#F9FAFB",
  padding: 20,
  fontFamily:
    "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 380,
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: PURPLE,
};

const titleStyle: CSSProperties = { margin: "6px 0 0", fontSize: 21, fontWeight: 700 };

const subtitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 13,
  color: "#6B7280",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

const errorStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#FEF2F2",
  color: "#DC2626",
  fontSize: 13,
};

function submitStyle(disabled: boolean): CSSProperties {
  return {
    marginTop: 6,
    padding: "14px 18px",
    borderRadius: 10,
    border: "none",
    background: disabled ? "#E5E7EB" : PURPLE,
    color: disabled ? "#9CA3AF" : "#FFFFFF",
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
