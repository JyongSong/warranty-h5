import type { CSSProperties } from "react";

// Shared mobile-first styles for the installer app pages.

export const PRIMARY = "#111";
export const TEXT = "#18181b";
export const BORDER = "#e4e4e7";

export const page: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f4f5",
  color: TEXT,
  padding: "24px 16px 48px",
};

export const panel: CSSProperties = { width: "100%", maxWidth: 460, margin: "0 auto" };

export const h1: CSSProperties = { fontSize: 22, fontWeight: 800, margin: "0 0 6px" };

export const sub: CSSProperties = { fontSize: 14, color: "rgba(24,24,27,0.65)", margin: "0 0 18px", lineHeight: 1.6 };

export const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
};

export const label: CSSProperties = { display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 };

export const input: CSSProperties = {
  width: "100%",
  minHeight: 52,
  padding: "14px 14px",
  borderRadius: 10,
  border: `1px solid #d4d4d8`,
  background: "#fff",
  fontSize: 16,
  color: PRIMARY,
  boxSizing: "border-box",
  outline: "none",
};

export function primaryButton(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    minHeight: 52,
    borderRadius: 10,
    border: "none",
    background: disabled ? "#a1a1aa" : PRIMARY,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export const secondaryButton: CSSProperties = {
  width: "100%",
  minHeight: 52,
  borderRadius: 10,
  border: `1px solid #d4d4d8`,
  background: "#fff",
  color: TEXT,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

export const errorText: CSSProperties = { color: "#b42318", fontSize: 14, marginTop: 10, lineHeight: 1.5 };

export const rowLabel: CSSProperties = { fontSize: 12, color: "#71717a", fontWeight: 700 };
export const rowValue: CSSProperties = { fontSize: 15, color: TEXT, fontWeight: 600, lineHeight: 1.5, overflowWrap: "anywhere" };

export const badge = (bg: string, color: string): CSSProperties => ({
  display: "inline-block",
  fontSize: 12,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 999,
  background: bg,
  color,
});
