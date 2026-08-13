import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrders, type InstallerOrderItem } from "@/lib/installer/orders";
import { getInstallerAsOrders, type AsInstallerOrderItem } from "@/lib/installer/asOrders";
import { logoutInstallerAction } from "./actions";
import PushRegister from "./PushRegister";
import CompletionQueueBanner from "./CompletionQueueBanner";
import * as ui from "./ui";

export const dynamic = "force-dynamic";

export default async function InstallerOrdersPage() {
  const installer = await requireInstallerPage("/installer");
  const [orders, asOrders] = await Promise.all([
    getInstallerOrders(installer.id),
    getInstallerAsOrders(installer.id),
  ]);
  const { pending, active, completed, history } = orders;

  return (
    <main style={ui.page}>
      <PushRegister />
      <div style={ui.panel}>
        <div style={headerRow}>
          <div>
            <h1 style={{ ...ui.h1, marginBottom: 2 }}>내 작업</h1>
            <div style={{ fontSize: 13, color: "#71717a" }}>{installer.name} 기사님</div>
          </div>
          <form action={logoutInstallerAction}>
            <button type="submit" style={logoutButton}>
              로그아웃
            </button>
          </form>
        </div>

        <CompletionQueueBanner />

        <Section title="응답 대기" items={pending} emptyText="대기 중인 배정이 없습니다." />
        <Section title="진행 중" items={active} emptyText="진행 중인 작업이 없습니다." />
        {asOrders.pending.length > 0 ? <AsSection title="A/S · 응답 대기" items={asOrders.pending} /> : null}
        {asOrders.active.length > 0 ? <AsSection title="A/S · 처리 중" items={asOrders.active} /> : null}
        {completed.length > 0 ? <CompletedByDateSection items={completed} /> : null}
        {history.length > 0 ? <Section title="지난 내역" items={history} emptyText="" /> : null}
      </div>
    </main>
  );
}

function Section({ title, items, emptyText }: { title: string; items: InstallerOrderItem[]; emptyText: string }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={sectionTitle}>
        {title} <span style={{ color: "#a1a1aa" }}>{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "#a1a1aa", margin: "0 0 8px" }}>{emptyText}</p>
      ) : (
        items.map((item) => <OrderCard key={`${item.orderId}-${item.attemptId ?? item.status}`} item={item} />)
      )}
    </section>
  );
}

function CompletedByDateSection({ items }: { items: InstallerOrderItem[] }) {
  // items arrive sorted newest-first; group consecutive same-date runs.
  const groups: Array<{ date: string; items: InstallerOrderItem[] }> = [];
  for (const item of items) {
    const date = item.completedDate ?? "-";
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={sectionTitle}>
        완료 <span style={{ color: "#a1a1aa" }}>{items.length}</span>
      </h2>
      {groups.map((g) => (
        <div key={g.date} style={{ marginBottom: 10 }}>
          <div style={dateHeader}>{g.date}</div>
          {g.items.map((item) => (
            <OrderCard key={item.orderId} item={item} />
          ))}
        </div>
      ))}
    </section>
  );
}

function OrderCard({ item }: { item: InstallerOrderItem }) {
  return (
    <Link href={`/installer/orders/${item.orderId}`} style={cardLink}>
      <div style={{ ...ui.card, ...(item.rejectionReason ? { border: "2px solid #ef4444" } : {}) }}>
        {item.rejectionReason ? (
          <div style={rejectBanner}>
            ⚠ 반려됨 · 재등록 필요
            <div style={{ fontWeight: 400, marginTop: 2 }}>사유: {item.rejectionReason}</div>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <StatusBadge status={item.status} />
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{item.erpOrderNo}</span>
        </div>
        {item.productSummary ? <div style={{ ...ui.rowValue, marginBottom: 8 }}>{item.productSummary}</div> : null}
        <Row label="희망 일정" value={[item.installDate, item.installTimeSlot].filter(Boolean).join(" ") || "-"} />
        <Row label="주소" value={item.address ?? "-"} />
        {(item.status === "ACCEPTED" || item.status === "COMPLETED") && item.customerName ? (
          <Row label="고객" value={item.customerName} />
        ) : null}
        {item.status === "PENDING" ? (
          <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>고객 정보는 수락 후 표시됩니다.</div>
        ) : null}
      </div>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8, padding: "3px 0" }}>
      <div style={ui.rowLabel}>{label}</div>
      <div style={ui.rowValue}>{value}</div>
    </div>
  );
}

function AsSection({ title, items }: { title: string; items: AsInstallerOrderItem[] }) {
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

function AsCard({ item }: { item: AsInstallerOrderItem }) {
  return (
    <Link href={`/installer/as/${item.asOrderId}`} style={cardLink}>
      <div style={{ ...ui.card, ...(item.hqRejectionReason ? { border: "2px solid #ef4444" } : {}) }}>
        {item.hqRejectionReason ? (
          <div style={rejectBanner}>
            ⚠ 반려됨 · 재등록 필요
            <div style={{ fontWeight: 400, marginTop: 2 }}>사유: {item.hqRejectionReason}</div>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <AsStatusBadge status={item.status} />
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{item.symptomCode}</span>
        </div>
        <div style={{ ...ui.rowValue, marginBottom: 6 }}>{item.symptomLabel}</div>
        <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8, padding: "3px 0" }}>
          <div style={ui.rowLabel}>주소</div>
          <div style={ui.rowValue}>{item.address ?? "-"}</div>
        </div>
        {item.status === "PENDING" ? (
          <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>고객 정보는 수락 후 표시됩니다.</div>
        ) : null}
      </div>
    </Link>
  );
}

function AsStatusBadge({ status }: { status: AsInstallerOrderItem["status"] }) {
  const map: Record<AsInstallerOrderItem["status"], { text: string; bg: string; color: string }> = {
    PENDING: { text: "응답 대기", bg: "#fef3c7", color: "#92400e" },
    ACCEPTED: { text: "처리 중", bg: "#dcfce7", color: "#166534" },
    REVIEW: { text: "검수 대기", bg: "#dbeafe", color: "#1e40af" },
    COMPLETED: { text: "완료", bg: "#dbeafe", color: "#1e40af" },
  };
  const s = map[status];
  return <span style={ui.badge(s.bg, s.color)}>{s.text}</span>;
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

const headerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 18,
};

const logoutButton: CSSProperties = {
  border: `1px solid #d4d4d8`,
  background: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#52525b",
  cursor: "pointer",
};

const sectionTitle: CSSProperties = { fontSize: 15, fontWeight: 700, margin: "0 0 10px" };

const dateHeader: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#52525b",
  padding: "6px 0 4px",
};

const rejectBanner: CSSProperties = {
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
  marginBottom: 10,
};

const cardLink: CSSProperties = { textDecoration: "none", color: "inherit", display: "block" };
