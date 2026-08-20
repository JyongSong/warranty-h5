"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import type { InstallerTabCounts } from "@/lib/installer/tabCounts";

// 기사 앱 하단 탭. 모바일 한 손 조작을 전제로 사이드바 대신 하단 고정.

type Tab = {
  href: string;
  label: string;
  icon: string;
  /** 이 탭이 활성으로 보여야 하는 경로들 (상세 화면 포함) */
  match: (pathname: string) => boolean;
  /** 배지에 띄울 "지금 손대야 할" 건수 */
  count?: (counts: InstallerTabCounts) => number;
};

const TABS: Tab[] = [
  {
    href: "/installer",
    label: "설치",
    icon: "🔧",
    match: (p) => p === "/installer" || p.startsWith("/installer/orders"),
    count: (c) => c.install,
  },
  {
    href: "/installer/as",
    label: "A/S",
    icon: "🛠",
    match: (p) => p.startsWith("/installer/as"),
    count: (c) => c.as,
  },
  {
    href: "/installer/history",
    label: "이력·정산",
    icon: "📄",
    match: (p) => p.startsWith("/installer/history") || p.startsWith("/installer/settlement"),
  },
  {
    href: "/installer/me",
    label: "내 정보",
    icon: "👤",
    match: (p) => p.startsWith("/installer/me"),
  },
];

export default function InstallerNav({ counts }: { counts: InstallerTabCounts }) {
  const pathname = usePathname() ?? "";

  // 로그인 화면에는 탭을 띄우지 않는다 (아직 세션이 없어 어디로도 갈 수 없다).
  if (pathname.startsWith("/installer/login")) return null;

  return (
    <nav style={nav} aria-label="기사 앱 메뉴">
      <div style={navInner}>
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const count = tab.count?.(counts) ?? 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              style={{ ...tabLink, color: active ? "#111" : "#a1a1aa" }}
            >
              <span style={iconWrap}>
                <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden>
                  {tab.icon}
                </span>
                {count > 0 ? (
                  <span style={badge} aria-label={`처리할 항목 ${count}건`}>
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 11, fontWeight: active ? 800 : 600 }}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const nav: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  background: "#fff",
  borderTop: "1px solid #e4e4e7",
  // 홈 인디케이터가 있는 기기에서 탭이 가려지지 않게 한다.
  paddingBottom: "env(safe-area-inset-bottom)",
  zIndex: 50,
};

const navInner: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  maxWidth: 460,
  margin: "0 auto",
};

const iconWrap: CSSProperties = { position: "relative", display: "inline-flex" };

const badge: CSSProperties = {
  position: "absolute",
  top: -6,
  left: 12,
  minWidth: 18,
  height: 18,
  padding: "0 5px",
  borderRadius: 999,
  background: "#ef4444",
  color: "#fff",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: "18px",
  textAlign: "center",
  boxSizing: "border-box",
};

const tabLink: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  // 손가락 터치 타깃 최소 크기.
  minHeight: 56,
  textDecoration: "none",
};
