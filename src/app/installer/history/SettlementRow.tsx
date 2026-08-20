"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { MonthlySettlementRow } from "@/lib/installer/monthlySettlement";
import * as ui from "../ui";

const won = (n: number) => `${n.toLocaleString()}원`;

// 비용 항목은 접어둔다. 5개 항목을 매 카드에 펼치면 목록이 안 읽히고,
// 기사가 항목을 확인하는 건 금액에 이견이 있을 때뿐이다.
export default function SettlementRow({ row }: { row: MonthlySettlementRow }) {
  const [open, setOpen] = useState(false);

  const items = [
    { label: "연동비", value: row.linkageFee },
    { label: "출장비", value: row.travelFee },
    { label: "장거리", value: row.longDistanceFee },
    { label: "야간/휴일", value: row.nightWeekendFee },
    { label: "용역비", value: row.serviceFee },
  ].filter((item) => item.value > 0);

  return (
    <div style={ui.card}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={header}
      >
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div style={metaLine}>
            <span style={ui.badge(...typeBadge(row.sourceType))}>
              {row.sourceType === "AS" ? "A/S" : "설치"}
            </span>
            <span style={{ fontSize: 12, color: "#71717a" }}>{shortDate(row.completedDate)}</span>
          </div>
          <div style={labelLine}>{row.label}</div>
          {row.address ? <div style={addressLine}>{row.address}</div> : null}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{won(row.totalAmount)}</div>
          <div style={{ fontSize: 12, color: "#a1a1aa" }}>{open ? "접기 ▲" : "내역 ▼"}</div>
        </div>
      </button>

      {open ? (
        <div style={detail}>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: "#a1a1aa" }}>세부 항목이 없습니다.</div>
          ) : (
            items.map((item) => (
              <div key={item.label} style={detailRow}>
                <span style={ui.rowLabel}>{item.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{won(item.value)}</span>
              </div>
            ))
          )}
          {row.wallpadAmount > 0 ? (
            <div style={wallpadNote}>
              월패드 현장 수금 {won(row.wallpadAmount)} · 정산 미포함
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function typeBadge(type: "INSTALL" | "AS"): [string, string] {
  return type === "AS" ? ["#fef3c7", "#92400e"] : ["#eef2ff", "#4338ca"];
}

/** 2026-08-18 → 8/18 */
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  width: "100%",
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
};

const metaLine: CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 };

const labelLine: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
};

const addressLine: CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  marginTop: 2,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const detail: CSSProperties = {
  borderTop: "1px solid #e4e4e7",
  marginTop: 12,
  paddingTop: 10,
};

const detailRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "3px 0",
};

const wallpadNote: CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  marginTop: 8,
  lineHeight: 1.5,
};
