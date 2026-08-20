import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import {
  currentYm,
  getInstallerMonthlySettlement,
  isValidYm,
  shiftYm,
} from "@/lib/installer/monthlySettlement";
import SettlementRow from "./SettlementRow";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

const won = (n: number) => `${n.toLocaleString()}원`;

export default async function InstallerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const installer = await requireInstallerPage("/installer/history");
  const { ym: rawYm } = await searchParams;
  const thisMonth = currentYm();
  const ym = rawYm && isValidYm(rawYm) ? rawYm : thisMonth;

  const summary = await getInstallerMonthlySettlement(installer.id, ym);

  const prevYm = shiftYm(ym, -1);
  const nextYm = shiftYm(ym, 1);
  // 미래 달은 볼 것이 없으므로 막는다.
  const canGoNext = nextYm <= thisMonth;

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <nav style={monthNav} aria-label="월 선택">
          <Link href={`/installer/history?ym=${prevYm}`} style={monthArrow} aria-label="이전 달">
            ‹
          </Link>
          <span style={monthLabel}>{formatYm(ym)}</span>
          {canGoNext ? (
            <Link href={`/installer/history?ym=${nextYm}`} style={monthArrow} aria-label="다음 달">
              ›
            </Link>
          ) : (
            <span style={{ ...monthArrow, color: "#d4d4d8" }} aria-hidden>
              ›
            </span>
          )}
        </nav>

        <div style={heroCard}>
          <div style={{ fontSize: 13, color: "#71717a", fontWeight: 700 }}>
            {ym === thisMonth ? "이번 달 정산" : `${formatYm(ym)} 정산`}
          </div>
          <div style={heroAmount}>{won(summary.total)}</div>
          <div style={{ fontSize: 13, color: "#71717a" }}>
            총 {summary.installCount + summary.asCount}건
          </div>
        </div>

        {summary.pendingReviewCount > 0 ? (
          <div style={pendingBox}>
            <div style={{ fontWeight: 800 }}>⏳ 검수 대기 {summary.pendingReviewCount}건 · 금액 미확정</div>
            <div style={{ marginTop: 3, fontWeight: 400 }}>
              본사 승인 후 정산에 반영됩니다.
            </div>
          </div>
        ) : null}

        <div style={ui.card}>
          <BreakdownRow label="설치" count={summary.installCount} amount={summary.installAmount} />
          <BreakdownRow label="A/S" count={summary.asCount} amount={summary.asAmount} />
          {summary.wallpadTotal > 0 ? (
            <div style={wallpadBlock}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#71717a" }}>
                  💵 월패드 현장 수금
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#71717a" }}>
                  {won(summary.wallpadTotal)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4, lineHeight: 1.5 }}>
                현장에서 직접 받으신 금액입니다. 위 정산 금액에는 포함되지 않습니다.
              </div>
            </div>
          ) : null}
        </div>

        <h2 style={listTitle}>작업 내역</h2>
        {summary.rows.length === 0 ? (
          <div style={{ ...ui.card, textAlign: "center", color: "#a1a1aa", fontSize: 14 }}>
            이 달에는 정산된 작업이 없습니다.
          </div>
        ) : (
          summary.rows.map((row) => <SettlementRow key={row.id} row={row} />)
        )}
      </div>
    </main>
  );
}

function BreakdownRow({ label, count, amount }: { label: string; count: number; amount: number }) {
  return (
    <div style={breakdownRow}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#a1a1aa" }}>{count}건</span>
      <span style={{ fontSize: 15, fontWeight: 700, textAlign: "right" }}>{won(amount)}</span>
    </div>
  );
}

/** 2026-08 → 2026년 8월 */
function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

const monthNav: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  marginBottom: 14,
};

const monthArrow: CSSProperties = {
  // 화살표는 탭 대상이라 손가락 크기를 확보한다.
  minWidth: 44,
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 26,
  color: "#3f3f46",
  textDecoration: "none",
  lineHeight: 1,
};

const monthLabel: CSSProperties = { fontSize: 17, fontWeight: 800, minWidth: 120, textAlign: "center" };

const heroCard: CSSProperties = {
  ...ui.card,
  textAlign: "center",
  padding: "20px 16px",
};

const heroAmount: CSSProperties = { fontSize: 34, fontWeight: 800, margin: "6px 0 4px", letterSpacing: -0.5 };

const pendingBox: CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 13,
  lineHeight: 1.5,
  marginBottom: 12,
};

const breakdownRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  alignItems: "center",
  gap: 12,
  padding: "6px 0",
};

const wallpadBlock: CSSProperties = {
  borderTop: "1px solid #e4e4e7",
  marginTop: 10,
  paddingTop: 10,
};

const listTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  margin: "22px 0 8px",
  color: "#3f3f46",
};
