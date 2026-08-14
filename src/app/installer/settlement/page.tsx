import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { listInstallerOwnSettlementLines } from "@/lib/installation/settlement/service";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

const won = (n: number) => `${n.toLocaleString()}원`;
const kstDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const SOURCE_LABEL: Record<string, string> = { INSTALL: "설치", AS: "A/S" };

export default async function InstallerSettlementPage() {
  const installer = await requireInstallerPage("/installer/settlement");
  const lines = await listInstallerOwnSettlementLines(installer.id);

  const total = lines.reduce((sum, l) => sum + l.totalAmount, 0);

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h1 style={{ ...ui.h1, marginBottom: 0 }}>내 정산</h1>
          <Link href="/installer" style={{ fontSize: 13, color: "#71717a", textDecoration: "none" }}>
            ← 내 작업
          </Link>
        </div>
        <p style={ui.sub}>{installer.name} 기사님 · 승인 완료된 건의 정산 금액입니다.</p>

        <div style={{ ...ui.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={ui.rowLabel}>누적 정산 합계 ({lines.length}건)</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{won(total)}</span>
        </div>

        {lines.length === 0 ? (
          <div style={{ ...ui.card, textAlign: "center", color: "#a1a1aa", fontSize: 14 }}>
            아직 정산 내역이 없습니다.
          </div>
        ) : (
          lines.map((l) => (
            <div key={l.id} style={ui.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={ui.badge("#eef2ff", "#4338ca")}>{SOURCE_LABEL[l.sourceType] ?? l.sourceType}</span>
                <span style={{ fontSize: 13, color: "#71717a" }}>{kstDate(l.completedAt)}</span>
              </div>
              <div style={lineGrid}>
                {l.linkageFee > 0 ? <Item label="연동비" value={won(l.linkageFee)} /> : null}
                {l.travelFee > 0 ? <Item label="출장비" value={won(l.travelFee)} /> : null}
                {l.longDistanceFee > 0 ? <Item label="장거리" value={won(l.longDistanceFee)} /> : null}
                {l.nightWeekendFee > 0 ? <Item label="야간/주말" value={won(l.nightWeekendFee)} /> : null}
                {l.serviceFee > 0 ? <Item label="용역비" value={won(l.serviceFee)} /> : null}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e4e4e7", marginTop: 8, paddingTop: 8 }}>
                <span style={ui.rowLabel}>합계</span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{won(l.totalAmount)}</span>
              </div>
              {l.wallpadAmount > 0 ? (
                <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6 }}>
                  월패드 현장 금액 {won(l.wallpadAmount)} (정산 미포함)
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, color: "#71717a" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const lineGrid: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
