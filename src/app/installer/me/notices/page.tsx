import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { listInboxNotices } from "@/lib/installer/inbox";
import NoticeBody from "../../NoticeBody";
import * as ui from "../../ui";

export const dynamic = "force-dynamic";

export default async function InstallerNoticesPage() {
  const installer = await requireInstallerPage("/installer/me/notices");
  const notices = await listInboxNotices(installer.id).catch(() => []);
  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <Link href="/installer/me" style={back}>
          ‹ 내 정보
        </Link>
        <h1 style={ui.h1}>본사 공지</h1>
        {notices.length === 0 ? (
          <div style={{ ...ui.card, color: "#71717a", fontSize: 14 }}>받은 공지가 없습니다.</div>
        ) : (
          notices.map((n) => (
            <details key={n.id} style={ui.card} open={notices[0].id === n.id}>
              <summary style={summary}>
                <span style={{ fontWeight: 800 }}>{n.title}</span>
                <span style={date}>{new Date(n.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
              </summary>
              <NoticeBody text={n.body} style={{ marginTop: 10 }} />
            </details>
          ))
        )}
      </div>
    </main>
  );
}

const back: CSSProperties = { display: "inline-block", fontSize: 14, color: "#52525b", textDecoration: "none", marginBottom: 8 };
const summary: CSSProperties = { cursor: "pointer", fontSize: 15, display: "flex", flexDirection: "column", gap: 2 };
const date: CSSProperties = { fontSize: 12, color: "#71717a", fontWeight: 500 };
