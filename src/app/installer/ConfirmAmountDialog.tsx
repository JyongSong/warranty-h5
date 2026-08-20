"use client";

import type { CSSProperties, ReactNode } from "react";
import * as ui from "./ui";

const won = (n: number) => `${n.toLocaleString()}원`;

export type AmountLine = { label: string; value: number };

/**
 * 제출 직전에 정산 금액을 보여주고 한 번 확인받는다.
 *
 * 기사가 얼마짜리 건을 올리는지 모르고 제출한 뒤, 나중에 정산 내역을 보고
 * 문의하는 흐름을 막는 것이 목적이다.
 *
 * amount 가 null 이면 금액을 계산하지 못한 것이다(오프라인 등). 그때도 제출은
 * 막지 않고, 금액 없이 확인만 받는다.
 */
export default function ConfirmAmountDialog({
  open,
  title,
  amount,
  lines,
  note,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  amount: number | null;
  lines?: AmountLine[];
  note?: ReactNode;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const visibleLines = (lines ?? []).filter((line) => line.value > 0);

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div style={sheet}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#71717a" }}>{title}</div>

        {amount === null ? (
          <div style={unknownAmount}>
            금액을 확인할 수 없습니다.
            <div style={{ fontWeight: 400, marginTop: 4 }}>
              지금 제출하면 본사 승인 후 정산에 반영됩니다.
            </div>
          </div>
        ) : (
          <>
            <div style={amountText}>{won(amount)}</div>
            {visibleLines.length > 0 ? (
              <div style={lineBox}>
                {visibleLines.map((line) => (
                  <div key={line.label} style={lineRow}>
                    <span style={ui.rowLabel}>{line.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{won(line.value)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        {note ? <div style={noteBox}>{note}</div> : null}

        <div style={{ marginTop: 18 }}>
          <button style={ui.primaryButton(busy)} disabled={busy} onClick={onConfirm}>
            {busy ? "제출 중…" : "제출하기"}
          </button>
          <div style={{ height: 8 }} />
          <button style={ui.secondaryButton} disabled={busy} onClick={onCancel}>
            다시 확인
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
  background: "#fff",
  borderRadius: "16px 16px 0 0",
  padding: "22px 18px calc(22px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const amountText: CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: "6px 0 14px",
  letterSpacing: -0.5,
};

const unknownAmount: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: "8px 0 14px",
  lineHeight: 1.5,
};

const lineBox: CSSProperties = {
  border: `1px solid ${ui.BORDER}`,
  borderRadius: 10,
  padding: "10px 12px",
};

const lineRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "3px 0",
};

const noteBox: CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.6,
  marginTop: 12,
};
