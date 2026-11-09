import Link from "next/link";
import type { CSSProperties } from "react";
import type { InstallerOrderItem } from "@/lib/installer/orders";
import type { AsInstallerOrderItem } from "@/lib/installer/asOrders";
import * as ui from "./ui";

// 설치/A/S 목록 카드. 탭이 나뉘면서 여러 페이지가 같은 카드를 쓴다.

export function Section({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: InstallerOrderItem[];
  emptyText: string;
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={sectionTitle}>
        {title} <span style={{ color: "#a1a1aa" }}>{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p style={emptyStyle}>{emptyText}</p>
      ) : (
        items.map((item) => <OrderCard key={`${item.orderId}-${item.attemptId ?? item.status}`} item={item} />)
      )}
    </section>
  );
}

export function OrderCard({ item }: { item: InstallerOrderItem }) {
  return (
    <Link href={`/installer/orders/${item.orderId}`} style={cardLink}>
      <div
        style={{
          ...ui.card,
          ...(item.agentProxy ? { border: `2px solid ${AGENT_PROXY_COLOR}` } : {}),
          ...(item.rejectionReason ? { border: "2px solid #ef4444" } : {}),
        }}
      >
        {item.rejectionReason ? (
          <div style={rejectBanner}>
            ⚠ 반려됨 · 재등록 필요
            <div style={{ fontWeight: 400, marginTop: 2 }}>사유: {item.rejectionReason}</div>
          </div>
        ) : null}
        <div style={cardHeader}>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <StatusBadge status={item.status} />
            {item.agentProxy ? <AgentProxyBadge /> : null}
          </span>
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{item.erpOrderNo}</span>
        </div>
        {item.productSummary ? <div style={{ ...ui.rowValue, marginBottom: 8 }}>{item.productSummary}</div> : null}
        <Row label="희망 일정" value={[item.installDate, item.installTimeSlot].filter(Boolean).join(" ") || "-"} />
        <Row label="주소" value={item.address ?? "-"} />
        {item.status !== "PENDING" && item.customerName ? (
          <Row label="고객" value={item.customerName} />
        ) : null}
        {item.agentProxy && item.status === "PENDING" ? <AgentProxyNotice baseFee={item.agentProxyBaseFee} /> : null}
        {item.status === "PENDING" ? (
          <div style={pendingNote}>고객 정보는 수락 후 표시됩니다.</div>
        ) : null}
      </div>
    </Link>
  );
}

// 총판 대행 건 표시. 상태 색(노랑·초록·파랑)과 섞이지 않게 보라색을 쓴다.
export const AGENT_PROXY_COLOR = "#7c3aed";

export function AgentProxyBadge() {
  return <span style={ui.badge("#ede9fe", "#5b21b6")}>총판 대행</span>;
}

/** 수락 전 안내: 담당 기사가 없는 지역이라 현지 기사를 찾아야 하고, 금액은 기본 출장비 + 기타 청구다. */
export function AgentProxyNotice({ baseFee }: { baseFee?: number | null }) {
  return (
    <div style={agentProxyNotice}>
      담당 기사 없는 지역 · 현지 기사 섭외 필요
      <br />
      기본 출장비{typeof baseFee === "number" ? ` ${baseFee.toLocaleString()}원` : ""} + 기타 청구
    </div>
  );
}

export function AsSection({ title, items }: { title: string; items: AsInstallerOrderItem[] }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={sectionTitle}>
        {title} <span style={{ color: "#a1a1aa" }}>{items.length}</span>
      </h2>
      {items.map((item) => (
        <AsCard key={item.asOrderId} item={item} />
      ))}
    </section>
  );
}

export function AsCard({ item }: { item: AsInstallerOrderItem }) {
  return (
    <Link href={`/installer/as/${item.asOrderId}`} style={cardLink}>
      <div style={{ ...ui.card, ...(item.hqRejectionReason ? { border: "2px solid #ef4444" } : {}) }}>
        {item.hqRejectionReason ? (
          <div style={rejectBanner}>
            ⚠ 반려됨 · 재등록 필요
            <div style={{ fontWeight: 400, marginTop: 2 }}>사유: {item.hqRejectionReason}</div>
          </div>
        ) : null}
        <div style={cardHeader}>
          <AsStatusBadge status={item.status} />
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{item.symptomCode}</span>
        </div>
        <div style={{ ...ui.rowValue, marginBottom: 6 }}>{item.symptomLabel}</div>
        <Row label="주소" value={item.address ?? "-"} />
        {item.status === "PENDING" ? (
          <div style={pendingNote}>고객 정보는 수락 후 표시됩니다.</div>
        ) : null}
      </div>
    </Link>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8, padding: "3px 0" }}>
      <div style={ui.rowLabel}>{label}</div>
      <div style={ui.rowValue}>{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: InstallerOrderItem["status"] }) {
  const map: Record<InstallerOrderItem["status"], { text: string; bg: string; color: string }> = {
    PENDING: { text: "응답 대기", bg: "#fef3c7", color: "#92400e" },
    ACCEPTED: { text: "진행 중", bg: "#dcfce7", color: "#166534" },
    REVIEW: { text: "검수 대기", bg: "#dbeafe", color: "#1e40af" },
    COMPLETED: { text: "완료", bg: "#dbeafe", color: "#1e40af" },
    REJECTED: { text: "거절", bg: "#f4f4f5", color: "#71717a" },
    TIMED_OUT: { text: "시간 초과", bg: "#f4f4f5", color: "#71717a" },
  };
  const s = map[status];
  return <span style={ui.badge(s.bg, s.color)}>{s.text}</span>;
}

export function AsStatusBadge({ status }: { status: AsInstallerOrderItem["status"] }) {
  const map: Record<AsInstallerOrderItem["status"], { text: string; bg: string; color: string }> = {
    PENDING: { text: "응답 대기", bg: "#fef3c7", color: "#92400e" },
    ACCEPTED: { text: "처리 중", bg: "#dcfce7", color: "#166534" },
    REVIEW: { text: "검수 대기", bg: "#dbeafe", color: "#1e40af" },
    COMPLETED: { text: "완료", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status];
  return <span style={ui.badge(s.bg, s.color)}>{s.text}</span>;
}

export function EmptyCard({ text }: { text: string }) {
  return <div style={{ ...ui.card, textAlign: "center", color: "#a1a1aa", fontSize: 14 }}>{text}</div>;
}

const sectionTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  margin: "0 0 8px",
  color: "#3f3f46",
};

const cardLink: CSSProperties = { textDecoration: "none", color: "inherit", display: "block" };

const cardHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const rejectBanner: CSSProperties = {
  background: "#fef2f2",
  color: "#b42318",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 10,
};

const emptyStyle: CSSProperties = { fontSize: 13, color: "#a1a1aa", margin: "0 0 8px" };

const agentProxyNotice: CSSProperties = {
  background: "#f5f3ff",
  color: "#5b21b6",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.6,
  marginTop: 8,
};

const pendingNote: CSSProperties = { fontSize: 12, color: "#92400e", marginTop: 6 };
