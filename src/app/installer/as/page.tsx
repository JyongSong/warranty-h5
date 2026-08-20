import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerAsOrders } from "@/lib/installer/asOrders";
import { AsSection, EmptyCard } from "../cards";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

export default async function InstallerAsPage() {
  const installer = await requireInstallerPage("/installer/as");
  // A/S 조회가 실패해도 화면 전체가 죽지 않게 한다 (홈에서 쓰던 방어를 유지).
  const asOrders = await getInstallerAsOrders(installer.id).catch(
    (): Awaited<ReturnType<typeof getInstallerAsOrders>> => ({ pending: [], active: [], completed: [] }),
  );

  const hasAny = asOrders.pending.length > 0 || asOrders.active.length > 0;

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={headerRow}>
          <h1 style={{ ...ui.h1, marginBottom: 2 }}>A/S</h1>
          <div style={{ fontSize: 13, color: "#71717a" }}>{installer.name} 기사님</div>
        </div>

        {asOrders.pending.length > 0 ? <AsSection title="응답 대기" items={asOrders.pending} /> : null}
        {asOrders.active.length > 0 ? <AsSection title="처리 중" items={asOrders.active} /> : null}
        {hasAny ? null : <EmptyCard text="배정된 A/S가 없습니다." />}
      </div>
    </main>
  );
}

const headerRow: CSSProperties = { marginBottom: 16 };
