"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import type { CSSProperties } from "react";
import type { InboxNotice } from "@/lib/installer/inbox";
import { markNoticeReadAction } from "./inbox-actions";
import NoticeBody from "./NoticeBody";
import { hasSeenInstallerGuide } from "./guideSeen";
import * as ui from "./ui";

/**
 * 본사가 「기사 공지 발송」으로 보낸 안 읽은 공지를 앱을 열 때 띄운다.
 * 「확인했습니다」를 누르면 읽음으로 저장하고, 안 읽은 공지가 더 있으면 다음 것이 뜬다.
 * 처음 쓰는 기사에게는 사용 안내(FirstVisitGuide)가 먼저다.
 */
const HIDDEN_PATH_PREFIXES = ["/installer/login", "/installer/guide", "/installer/me/notices"];

const noopSubscribe = () => () => {};

export default function InboxNoticePopup({ notice }: { notice: InboxNotice | null }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closedId, setClosedId] = useState<string | null>(null);
  const guideSeen = useSyncExternalStore(noopSubscribe, hasSeenInstallerGuide, () => false);

  if (!notice || closedId === notice.id || !guideSeen) return null;
  if (HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const confirm = () =>
    startTransition(async () => {
      setClosedId(notice.id);
      await markNoticeReadAction(notice.id);
      router.refresh();
    });

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-labelledby="inbox-notice-title">
      <div style={sheet}>
        <div style={tag}>본사 공지</div>
        <h2 id="inbox-notice-title" style={title}>
          {notice.title}
        </h2>
        <div style={date}>{new Date(notice.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</div>
        <NoticeBody text={notice.body} style={{ marginTop: 12 }} />
        <div style={{ marginTop: 18 }}>
          <button type="button" style={ui.primaryButton(pending)} disabled={pending} onClick={confirm}>
            확인했습니다
          </button>
          <Link href="/installer/me/notices" onClick={confirm} style={secondary}>
            지난 공지 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 210,
};
const sheet: CSSProperties = {
  width: "100%",
  maxWidth: 460,
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: "16px 16px 0 0",
  padding: "22px 18px calc(22px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};
const tag: CSSProperties = {
  display: "inline-block",
  background: "#1d4ed8",
  color: "#fff",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 700,
};
const title: CSSProperties = { fontSize: 19, fontWeight: 800, margin: "10px 0 4px", wordBreak: "keep-all" };
const date: CSSProperties = { fontSize: 12, color: "#71717a" };
const secondary: CSSProperties = {
  ...ui.secondaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  marginTop: 10,
  boxSizing: "border-box",
};
