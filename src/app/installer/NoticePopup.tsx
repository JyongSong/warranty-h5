"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { INSTALLER_NOTICE } from "@/lib/installer/notice";
import FeeSections from "./FeeSections";
import { hasSeenInstallerGuide } from "./guideSeen";
import * as ui from "./ui";

/**
 * 앱을 열면 본사 공지를 한 번 띄운다. "확인했습니다"를 누르면 이 기기에서는 다시 뜨지 않고,
 * 내용은 내 정보 → 자주 묻는 질문 에서 언제든 다시 본다. 공지가 바뀌면 INSTALLER_NOTICE.id 를 바꿔 다시 띄운다.
 *
 * 처음 쓰는 기사에게는 사용 안내가 먼저다(FirstVisitGuide). 안내를 본 뒤부터 띄운다.
 */
const STORAGE_KEY = `installer.notice.ack.${INSTALLER_NOTICE.id}`;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readAcknowledged() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // 저장소를 못 쓰면 매번 뜨는 것보다 안 뜨는 편이 낫다. 자주 묻는 질문에서 볼 수 있다.
    return true;
  }
}

function acknowledge() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // 저장 못 해도 이번 화면에서는 닫는다.
  }
  acknowledgedInMemory = true;
  listeners.forEach((listener) => listener());
}

let acknowledgedInMemory = false;

// 공지 팝업 켜기/끄기. 끄면 아무 화면에도 뜨지 않는다(자주 묻는 질문 화면은 그대로).
const NOTICE_ENABLED = true;

const HIDDEN_PATH_PREFIXES = ["/installer/login", "/installer/guide", "/installer/faq"];

export default function NoticePopup({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const acknowledged = useSyncExternalStore(
    subscribe,
    () => acknowledgedInMemory || readAcknowledged(),
    () => true,
  );
  const guideSeen = useSyncExternalStore(subscribe, hasSeenInstallerGuide, () => false);

  if (!NOTICE_ENABLED || !loggedIn || acknowledged || !guideSeen) return null;
  if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-labelledby="installer-notice-title">
      <div style={sheet}>
        <div style={tag}>공지</div>
        <h2 id="installer-notice-title" style={title}>
          {INSTALLER_NOTICE.title}
        </h2>
        <div style={effective}>{INSTALLER_NOTICE.effective}</div>
        <p style={intro}>{INSTALLER_NOTICE.intro}</p>
        <FeeSections />
        <div style={{ marginTop: 18 }}>
          <button type="button" style={ui.primaryButton(false)} onClick={acknowledge}>
            확인했습니다
          </button>
          <Link href="/installer/faq" onClick={acknowledge} style={detailLink}>
            자주 묻는 질문 보기
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
  zIndex: 200,
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
  background: "#111",
  color: "#fff",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const title: CSSProperties = { fontSize: 19, fontWeight: 800, margin: "10px 0 4px" };

const effective: CSSProperties = { fontSize: 14, fontWeight: 700, color: "#92400e" };

const intro: CSSProperties = { fontSize: 13, color: "#52525b", lineHeight: 1.6, margin: "8px 0 10px" };



const detailLink: CSSProperties = {
  ...ui.secondaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  marginTop: 10,
  boxSizing: "border-box",
};
