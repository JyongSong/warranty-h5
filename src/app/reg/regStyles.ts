import type React from "react";

// /reg 와 /reg/cj 가 같은 모양을 쓰도록 모아 둔 인라인 스타일.

export const snHelpLinkStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "#1d3129",
  textDecoration: "underline",
  fontSize: 12,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 10,
  background: "#fff",
  fontSize: 14,
  color: "#111",
  outline: "none",
};

export const consentBoxStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#71717a",
  background: "#f4f4f5",
  padding: "8px 12px",
  borderRadius: 8,
  lineHeight: 1.5,
  border: "1px solid #e4e4e7",
};

const PRIMARY_BUTTON_SHADOW =
  "0 12px 28px rgba(29,49,41,0.45), 0 4px 10px rgba(29,49,41,0.25)";

export function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 44,
    borderRadius: 12,
    border: "1px solid #1d3129",
    background: "#1d3129",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    boxShadow: disabled ? "none" : PRIMARY_BUTTON_SHADOW,
    transform: disabled ? "none" : "translateY(-1px)",
    transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
  };
}
