"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { InstallationCompletionView } from "@/lib/installation/completion/service";
import {
  approveInstallationCompletionAction,
  rejectInstallationCompletionAction,
} from "../actions";

const CAP_LABEL: Record<string, string> = {
  NONE: "없음",
  DOORLOCK_AND_APP: "APP 연동",
  DOORLOCK_AND_APP_AND_HUB: "허브 연동",
};
const CAP_RANK: Record<string, number> = {
  NONE: 0,
  DOORLOCK_AND_APP: 1,
  DOORLOCK_AND_APP_AND_HUB: 2,
};

export default function CompletionReviewPanel({
  orderId,
  orderStatus,
  requiredAqaraAppCapability,
  completion,
}: {
  orderId: string;
  orderStatus: string;
  requiredAqaraAppCapability: string;
  completion: InstallationCompletionView;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [longDistance, setLongDistance] = useState(
    completion.longDistanceAmount != null ? String(completion.longDistanceAmount) : "",
  );

  const canReview = orderStatus === "WAITING_HQ_REVIEW";
  const belowRequirement =
    (CAP_RANK[completion.achievedAqaraAppCapability] ?? 0) < (CAP_RANK[requiredAqaraAppCapability] ?? 0);

  async function approve() {
    const digits = longDistance.replace(/[^\d]/g, "");
    const amount = digits === "" ? null : Number(digits);
    setBusy(true);
    setError(null);
    const res = await approveInstallationCompletionAction(orderId, amount);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function reject() {
    if (!reason.trim()) {
      setError("반려 사유를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await rejectInstallationCompletionAction(orderId, reason.trim());
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <section style={panel}>
      <div style={headerRow}>
        <h2 style={title}>완료 검수</h2>
        <span style={statusBadge(completion.reviewStatus)}>{reviewLabel(completion.reviewStatus)}</span>
      </div>

      <div style={grid}>
        <Field label="설치 종료" value={formatDateTime(completion.installEndAt)} />
        <Field
          label="연동 등급"
          value={CAP_LABEL[completion.achievedAqaraAppCapability] ?? completion.achievedAqaraAppCapability}
          warn={belowRequirement}
          warnText={belowRequirement ? `요구: ${CAP_LABEL[requiredAqaraAppCapability] ?? requiredAqaraAppCapability}` : undefined}
        />
        <Field
          label="월패드"
          value={
            completion.wallpadLinked
              ? `연동${completion.wallpadAmount ? ` · ${completion.wallpadAmount.toLocaleString()}원` : ""}`
              : "안 함"
          }
        />
        <Field
          label="장거리 (기사 신고)"
          value={completion.longDistanceAmount != null ? `${completion.longDistanceAmount.toLocaleString()}원` : "없음"}
        />
        <Field label="제출 시각" value={formatDateTime(completion.submittedAt)} />
      </div>

      {completion.photoUrls.length > 0 ? (
        <div style={photoRow}>
          {completion.photoUrls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`photo-${i + 1}`} style={photo} />
            </a>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#a1a1aa" }}>첨부된 사진이 없습니다.</div>
      )}

      {completion.reviewStatus === "REJECTED" && completion.rejectionReason ? (
        <div style={rejectNote}>반려 사유: {completion.rejectionReason}</div>
      ) : null}

      {error ? <div style={{ color: "#b42318", fontSize: 13, marginTop: 10 }}>{error}</div> : null}

      {canReview ? (
        !rejectOpen ? (
          <div>
            <label style={{ fontSize: 12, color: "#71717a", fontWeight: 700, display: "block", marginTop: 12 }}>
              장거리 비용 (원, 승인 시 확정 · 정산 반영)
            </label>
            <input
              style={longDistanceInput}
              value={longDistance}
              onChange={(e) => setLongDistance(e.target.value)}
              inputMode="numeric"
              placeholder="0"
            />
            <div style={btnRow}>
              <button style={approveBtn} disabled={busy} onClick={approve}>
                {busy ? "처리 중…" : "승인 (완료 처리)"}
              </button>
              <button style={rejectBtn} disabled={busy} onClick={() => setRejectOpen(true)}>
                반려
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <textarea
              style={reasonBox}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="반려 사유를 입력해 주세요 (기사에게 전달됩니다)"
              rows={3}
            />
            <div style={btnRow}>
              <button style={rejectBtn} disabled={busy} onClick={reject}>
                {busy ? "처리 중…" : "반려 확정"}
              </button>
              <button style={cancelBtn} disabled={busy} onClick={() => setRejectOpen(false)}>
                취소
              </button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  warn,
  warnText,
}: {
  label: string;
  value: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#71717a", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: warn ? "#b42318" : "#18181b" }}>
        {value}
        {warn && warnText ? <span style={{ fontSize: 12, marginLeft: 6 }}>⚠ {warnText}</span> : null}
      </div>
    </div>
  );
}

function reviewLabel(s: string) {
  return s === "APPROVED" ? "승인됨" : s === "REJECTED" ? "반려됨" : "검수 대기";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { hour12: false });
}

const panel: CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 16,
  margin: "0 0 16px",
  background: "#fff",
};
const headerRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 };
const title: CSSProperties = { fontSize: 16, fontWeight: 800, margin: 0 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 };
const photoRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const photo: CSSProperties = { width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid #e4e4e7" };
const rejectNote: CSSProperties = { marginTop: 12, fontSize: 13, color: "#b42318", background: "#fef2f2", padding: 10, borderRadius: 8 };
const btnRow: CSSProperties = { display: "flex", gap: 8, marginTop: 12 };
const longDistanceInput: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  padding: 10,
  fontSize: 14,
  marginTop: 6,
  boxSizing: "border-box",
};
const reasonBox: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  padding: 10,
  fontSize: 14,
  boxSizing: "border-box",
  resize: "vertical",
};
const approveBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const rejectBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #b42318",
  background: "#fff",
  color: "#b42318",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: "#52525b",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

function statusBadge(s: string): CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    PENDING: { bg: "#fef3c7", color: "#92400e" },
    APPROVED: { bg: "#dcfce7", color: "#166534" },
    REJECTED: { bg: "#fee2e2", color: "#991b1b" },
  };
  const c = map[s] ?? map.PENDING;
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 999,
    background: c.bg,
    color: c.color,
  };
}
