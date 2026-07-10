"use client";

import { useState } from "react";
import Link from "next/link";
import BackofficeSidebarNav from "./BackofficeSidebarNav";
import BackofficeUserMenu from "./BackofficeUserMenu";

export default function BackofficeMobileNav({ userEmail }: { userEmail?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          aria-label={open ? "백오피스 메뉴 닫기" : "백오피스 메뉴 열기"}
          aria-expanded={open}
          aria-controls="backoffice-mobile-menu"
          onClick={() => setOpen((value) => !value)}
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-900 transition hover:bg-zinc-50"
        >
          <span className="flex w-5 flex-col gap-1.5" aria-hidden="true">
            <span className="h-0.5 rounded-full bg-current" />
            <span className="h-0.5 rounded-full bg-current" />
            <span className="h-0.5 rounded-full bg-current" />
          </span>
        </button>

        <Link href="/backoffice" className="min-w-0 truncate text-sm font-semibold text-zinc-950">
          Backoffice
        </Link>

        {userEmail ? (
          <div className="ml-auto min-w-0">
            <BackofficeUserMenu email={userEmail} compact />
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 top-14 z-40 md:hidden" id="backoffice-mobile-menu">
          <button
            type="button"
            aria-label="백오피스 메뉴 닫기"
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[82vw] border-r border-slate-200 bg-white shadow-xl">
            <BackofficeSidebarNav className="space-y-1.5 px-3 py-3" onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
