import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrders } from "@/lib/installer/orders";
import CompletionQueueBanner from "./CompletionQueueBanner";
import { Section } from "./cards";
import * as ui from "./ui";

export const dynamic = "force-dynamic";

export default async function InstallerInstallPage() {
  const installer = await requireInstallerPage("/installer");
  const { pending, active } = await getInstallerOrders(installer.id);

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={headerRow}>
          <h1 style={{ ...ui.h1, marginBottom: 2 }}>설치</h1>
          <div style={{ fontSize: 13, color: "#71717a" }}>{installer.name} 기사님</div>
        </div>

        <CompletionQueueBanner />

        <Section title="응답 대기" items={pending} emptyText="대기 중인 배정이 없습니다." />
        <Section title="진행 중" items={active} emptyText="진행 중인 작업이 없습니다." />
      </div>
    </main>
  );
}

const headerRow: CSSProperties = { marginBottom: 16 };
