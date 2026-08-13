"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { AsInstallerOrderItem } from "@/lib/installer/asOrders";
import { respondToAsAction } from "../actions";
import * as ui from "../../ui";

const REJECT_REASONS = ["일정이 맞지 않음", "거리가 멀어 방문이 어려움", "해당 작업 역량 없음", "기타"] as const;

const ERR: Record<string, string> = {
  NOT_YOUR_AS_ORDER: "본인 배정이 아닙니다.",
  AS_ORDER_NOT_RESPONDABLE: "이미 처리되었거나 응답할 수 없는 상태입니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "처리에 실패했습니다. 새로고침 후 다시 확인해 주세요.",
};

const STATUS: Record<AsInstallerOrderItem["status"], { text: string; bg: string; color: string }> = {
  PENDING: { text: "응답 대기", bg: "#fef3c7", color: "#92400e" },
  ACCEPTED: { text: "처리 중", bg: "#dcfce7", color: "#166534" },
  REVIEW: { text: "검수 대기", bg: "#dbeafe", color: "#1e40af" },
  COMPLETED: { text: "완료", bg: "#dbeafe", color: "#1e40af" },
};

export default function AsDetailClient({ item }: { item: AsInstallerOrderItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const actionable = item.status === "PENDING";

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await respondToAsAction({ asOrderId: item.asOrderId, response: "ACCEPT" });
    setBusy(false);
    if (res.ok) router.push("/installer");
    else setError(ERR[res.error] ?? ERR.DEFAULT);
  }

  async function reject() {
    const finalReason = reason === "기타" ? customReason.trim() : reason;
    if (!finalReason) {
      setError("거절 사유를 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await respondToAsAction({ asOrderId: item.asOrderId, response: "REJECT", rejectReason: finalReason });
    setBusy(false);
    if (res.ok) router.push("/installer");
    else setError(ERR[res.error] ?? ERR.DEFAULT);
  }

  const s = STATUS[item.status];

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <button style={backLink} onClick={() => router.push("/installer")}>
          ← 목록으로
        </button>
        <h1 style={ui.h1}>A/S 상세</h1>
        <div style={{ marginBottom: 14 }}>
          <span style={ui.badge(s.bg, s.color)}>{s.text}</span>
        </div>

        {item.hqRejectionReason ? (
          <div style={rejectAlert}>
            <div style={{ fontWeight: 800 }}>⚠ A/S 처리가 반려되었습니다</div>
            <div style={{ marginTop: 4 }}>본사 반려 사유: {item.hqRejectionReason}</div>
            <div style={{ marginTop: 4, fontWeight: 400 }}>수정한 뒤 다시 처리 완료를 등록해 주세요.</div>
          </div>
        ) : null}

        <div style={ui.card}>
          <Row label="증상" value={`${item.symptomCode} · ${item.symptomLabel}`} />
          {item.symptomDetail ? <Row label="상세" value={item.symptomDetail} /> : null}
          <Row label="주소" value={item.address ?? "-"} />
          {item.customerName ? <Row label="고객명" value={item.customerName} /> : null}
          {item.customerPhone ? <Row label="연락처" value={item.customerPhone} /> : null}
          {item.status === "PENDING" ? (
            <div style={{ fontSize: 12, color: "#92400e", marginTop: 8 }}>
              고객 성함·연락처는 수락 후 표시됩니다.
            </div>
          ) : null}
        </div>

        {error ? <div style={ui.errorText}>{error}</div> : null}

        {item.status === "ACCEPTED" ? (
          <div style={{ marginTop: 16 }}>
            <button
              style={ui.primaryButton(false)}
              onClick={() => router.push(`/installer/as/${item.asOrderId}/complete`)}
            >
              처리 완료 등록
            </button>
          </div>
        ) : null}

        {actionable ? (
          !rejectOpen ? (
            <div style={{ marginTop: 16 }}>
              <button style={ui.primaryButton(busy)} disabled={busy} onClick={accept}>
                {busy ? "처리 중…" : "수락하기"}
              </button>
              <div style={{ height: 10 }} />
              <button style={ui.secondaryButton} disabled={busy} onClick={() => setRejectOpen(true)}>
                거절하기
              </button>
            </div>
          ) : (
            <div style={{ ...ui.card, marginTop: 16 }}>
              <div style={ui.label}>거절 사유</div>
              {REJECT_REASONS.map((r) => (
                <label key={r} style={reasonRow}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                  <span>{r}</span>
                </label>
              ))}
              {reason === "기타" ? (
                <input
                  style={{ ...ui.input, marginTop: 8 }}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="사유를 입력해 주세요"
                />
              ) : null}
              <div style={{ marginTop: 14 }}>
                <button style={ui.primaryButton(busy)} disabled={busy} onClick={reject}>
                  {busy ? "처리 중…" : "거절 확정"}
                </button>
                <div style={{ height: 10 }} />
                <button
                  style={ui.secondaryButton}
                  disabled={busy}
                  onClick={() => {
                    setRejectOpen(false);
                    setError(null);
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, padding: "5px 0" }}>
      <div style={ui.rowLabel}>{label}</div>
      <div style={ui.rowValue}>{value}</div>
    </div>
  );
}

const backLink: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#52525b",
  fontSize: 14,
  fontWeight: 600,
  padding: "4px 0",
  marginBottom: 8,
  cursor: "pointer",
};

const reasonRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 15 };

const rejectAlert: CSSProperties = {
  background: "#fef2f2",
  color: "#b91c1c",
  border: "2px solid #ef4444",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  lineHeight: 1.55,
  marginBottom: 14,
};
