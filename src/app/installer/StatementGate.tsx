"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import * as ui from "./ui";

/**
 * 현금영수증 정산: 지급됐는데 영수증을 아직 등록하지 않았으면 앱의 다른 기능을 막는다.
 * 정산서·정산 정보 화면만 열린다. (막힌 기사도 등록하면 바로 풀린다 — 다음 요청부터 blockedYm 이 사라짐)
 */
export default function StatementGate({ blockedYm, children }: { blockedYm: string | null; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const allowed =
    !blockedYm ||
    pathname.startsWith("/installer/statement/") ||
    pathname.startsWith("/installer/me/settlement-info") ||
    pathname.startsWith("/installer/login");
  if (allowed) return <>{children}</>;

  const label = `${blockedYm.slice(0, 4)}년 ${Number(blockedYm.slice(5))}월`;
  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={{ ...ui.card, textAlign: "center", padding: "28px 18px" }}>
          <div style={{ fontSize: 40 }}>🧾</div>
          <h1 style={{ ...ui.h1, marginTop: 8 }}>현금영수증 등록이 필요합니다</h1>
          <p style={{ ...ui.sub, marginBottom: 18 }}>
            {label} 정산금이 지급됐습니다. 본사 사업자번호로 지출증빙 현금영수증을 발급하고 승인번호를 등록하면 앱을 다시 쓸 수
            있습니다.
          </p>
          <Link
            href={`/installer/statement/${blockedYm}`}
            style={{ ...ui.primaryButton(false), display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
          >
            현금영수증 등록하기
          </Link>
        </div>
      </div>
    </main>
  );
}
