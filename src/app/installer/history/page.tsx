import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrders } from "@/lib/installer/orders";
import { getInstallerAsOrders } from "@/lib/installer/asOrders";
import { listInstallerOwnSettlementLines } from "@/lib/installation/settlement/service";
import { AsSection, CompletedByDateSection, EmptyCard, Section, sectionTitle } from "../cards";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

const won = (n: number) => `${n.toLocaleString()}원`;

export default async function InstallerHistoryPage() {
  const installer = await requireInstallerPage("/installer/history");
  const [orders, asOrders, settlementLines] = await Promise.all([
    getInstallerOrders(installer.id),
    getInstallerAsOrders(installer.id).catch(
      (): Awaited<ReturnType<typeof getInstallerAsOrders>> => ({ pending: [], active: [], completed: [] }),
    ),
    listInstallerOwnSettlementLines(installer.id).catch(
      (): Awaited<ReturnType<typeof listInstallerOwnSettlementLines>> => [],
    ),
  ]);
  const { completed, history } = orders;

  const settlementTotal = settlementLines.reduce((sum, line) => sum + line.totalAmount, 0);
  const hasHistory =
    completed.length > 0 || history.length > 0 || asOrders.completed.length > 0;

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ ...ui.h1, marginBottom: 2 }}>이력 · 정산</h1>
          <div style={{ fontSize: 13, color: "#71717a" }}>{installer.name} 기사님</div>
        </div>

        <Link href="/installer/settlement" style={settlementLink}>
          <div>
            <div style={ui.rowLabel}>누적 정산 합계 ({settlementLines.length}건)</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{won(settlementTotal)}</div>
          </div>
          <span style={{ fontSize: 13, color: "#71717a" }}>내역 보기 ›</span>
        </Link>

        {completed.length > 0 ? <CompletedByDateSection items={completed} /> : null}
        {asOrders.completed.length > 0 ? <AsSection title="A/S · 완료" items={asOrders.completed} /> : null}
        {history.length > 0 ? <Section title="지난 내역" items={history} emptyText="" /> : null}
        {hasHistory ? null : <EmptyCard text="아직 완료된 작업이 없습니다." />}
      </div>
    </main>
  );
}

const settlementLink: CSSProperties = {
  ...ui.card,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
  marginBottom: 20,
};

export { sectionTitle };
