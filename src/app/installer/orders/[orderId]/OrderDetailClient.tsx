"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { InstallerOrderItem } from "@/lib/installer/orders";
import { respondToAssignmentAction } from "../../actions";
import PhoneRow from "../../PhoneRow";
import * as ui from "../../ui";

const REJECT_REASONS = [
  "일정이 맞지 않음",
  "거리가 멀어 방문이 어려움",
  "해당 작업 역량 없음",
  "기타",
] as const;

const ERR: Record<string, string> = {
  NOT_YOUR_ASSIGNMENT: "본인 배정이 아닙니다.",
  UNAUTHORIZED: "로그인이 필요합니다. 다시 로그인해 주세요.",
  DEFAULT: "처리에 실패했습니다. 새로고침 후 다시 확인해 주세요.",
};

export default function OrderDetailClient({ item }: { item: InstallerOrderItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [customReason, setCustomReason] = useState("");

  const actionable = item.status === "PENDING" && !!item.attemptId;

  async function accept() {
    if (!item.attemptId) return;
    setBusy(true);
    setError(null);
    const res = await respondToAssignmentAction({ attemptId: item.attemptId, response: "ACCEPT" });
    setBusy(false);
    if (res.ok) router.push("/installer");
    else setError(ERR[res.error] ?? ERR.DEFAULT);
  }

  async function reject() {
    if (!item.attemptId) return;
    const finalReason = reason === "기타" ? customReason.trim() : reason;
    if (!finalReason) {
      setError("거절 사유를 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await respondToAssignmentAction({
      attemptId: item.attemptId,
      response: "REJECT",
      rejectReason: finalReason,
    });
    setBusy(false);
    if (res.ok) router.push("/installer");
    else setError(ERR[res.error] ?? ERR.DEFAULT);
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <button style={backLink} onClick={() => router.push("/installer")}>
          ← 목록으로
        </button>

        <h1 style={ui.h1}>작업 상세</h1>
        <div style={{ marginBottom: 14 }}>
          <StatusBadge status={item.status} />
        </div>

        {item.rejectionReason ? (
          <div style={rejectAlert}>
            <div style={{ fontWeight: 800 }}>⚠ 완료 등록이 반려되었습니다</div>
            <div style={{ marginTop: 4 }}>본사 반려 사유: {item.rejectionReason}</div>
            <div style={{ marginTop: 4, fontWeight: 400 }}>내용을 수정한 뒤 다시 완료 등록해 주세요.</div>
          </div>
        ) : null}

        <div style={ui.card}>
          <Row label="주문번호" value={item.erpOrderNo || "-"} />
          {item.productSummary ? <Row label="제품" value={item.productSummary} /> : null}
          <Row label="희망 일정" value={[item.installDate, item.installTimeSlot].filter(Boolean).join(" ") || "-"} />
          <Row label="주소" value={item.address ?? "-"} />
          {item.customerName ? <Row label="고객명" value={item.customerName} /> : null}
          {item.customerPhone ? <PhoneRow label="연락처" phone={item.customerPhone} /> : null}
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
              onClick={() => router.push(`/installer/orders/${item.orderId}/complete`)}
            >
              완료 등록
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
              <div style={{ ...ui.label }}>거절 사유</div>
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

function StatusBadge({ status }: { status: InstallerOrderItem["status"] }) {
  const map: Record<InstallerOrderItem["status"], { text: string; bg: string; color: string }> = {
    PENDING: { text: "응답 대기", bg: "#fef3c7", color: "#92400e" },
    ACCEPTED: { text: "진행 중", bg: "#dcfce7", color: "#166534" },
    COMPLETED: { text: "완료", bg: "#dbeafe", color: "#1e40af" },
    REJECTED: { text: "거절", bg: "#f4f4f5", color: "#71717a" },
    TIMED_OUT: { text: "시간 초과", bg: "#f4f4f5", color: "#71717a" },
  };
  const s = map[status];
  return <span style={ui.badge(s.bg, s.color)}>{s.text}</span>;
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

const reasonRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
  fontSize: 15,
};

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
