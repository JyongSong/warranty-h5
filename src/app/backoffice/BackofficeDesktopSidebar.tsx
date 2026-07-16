"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import BackofficeSidebarNav from "./BackofficeSidebarNav";
import BackofficeUserMenu from "./BackofficeUserMenu";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "backoffice-sidebar-collapsed-v1";
const sidebarStateListeners = new Set<() => void>();

function subscribeToSidebarState(listener: () => void) {
  sidebarStateListeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    sidebarStateListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSidebarCollapsedSnapshot() {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

export default function BackofficeDesktopSidebar({ userEmail }: { userEmail?: string }) {
  const collapsed = useSyncExternalStore(subscribeToSidebarState, getSidebarCollapsedSnapshot, () => false);

  function toggleCollapsed() {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(!collapsed));
    sidebarStateListeners.forEach((listener) => listener());
  }

  return (
    <aside
      className={[
        "hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-16" : "w-64",
      ].join(" ")}
      data-collapsed={collapsed}
    >
      <div className={["border-b border-slate-200 bg-white", collapsed ? "px-2 py-3" : "px-5 py-5"].join(" ")}>
        <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-3"}>
          <h1 className="min-w-0 flex-1">
            <Link
              href="/backoffice"
              aria-label={collapsed ? "Backoffice 홈" : undefined}
              title={collapsed ? "Backoffice 홈" : undefined}
              className={[
                "font-semibold text-slate-950",
                collapsed
                  ? "flex size-10 items-center justify-center rounded-md text-base hover:bg-slate-50"
                  : "block text-sm",
              ].join(" ")}
            >
              <span className={collapsed ? "sr-only" : "block text-[15px] leading-5"}>Backoffice</span>
              {collapsed ? <span aria-hidden="true">B</span> : null}
            </Link>
          </h1>

          <button
            type="button"
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 최소화"}
            aria-expanded={!collapsed}
            aria-controls="backoffice-desktop-navigation"
            title={collapsed ? "사이드바 펼치기" : "사이드바 최소화"}
            onClick={toggleCollapsed}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M7.5 4.5 12.5 10l-5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.5 3.5h13v13h-13z" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </button>
        </div>

      </div>

      <BackofficeSidebarNav id="backoffice-desktop-navigation" collapsed={collapsed} />

      {userEmail ? (
        <div
          className={[
            "mt-auto border-t border-slate-200 bg-white",
            collapsed ? "flex justify-center px-2 py-3" : "px-4 py-4",
          ].join(" ")}
        >
          <BackofficeUserMenu email={userEmail} iconOnly={collapsed} openUpward />
        </div>
      ) : null}
    </aside>
  );
}
