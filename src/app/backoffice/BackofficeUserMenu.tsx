"use client";

import { useState } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";

export default function BackofficeUserMenu({ email, compact = false }: { email: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (loading) return;

    setLoading(true);
    await fetch("/api/login/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/");
  }

  return (
    <div className={["relative shrink-0", compact ? "max-w-36" : "max-w-full"].join(" ")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${email} 계정 메뉴`}
        className={[
          "flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
          compact ? "h-9 px-3" : "h-10 w-full px-3",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{email}</span>
        </span>
        <span
          aria-hidden="true"
          className={[
            "size-1.5 shrink-0 border-b border-r border-current transition",
            open ? "translate-y-0.5 rotate-[225deg]" : "rotate-45",
          ].join(" ")}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          <LoadingButton
            type="button"
            role="menuitem"
            onClick={logout}
            loading={loading}
            loadingLabel="처리 중..."
            className="flex h-8 w-full items-center justify-start whitespace-nowrap rounded border border-transparent px-3 text-left text-xs font-semibold text-rose-700 transition hover:border-rose-100 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </LoadingButton>
        </div>
      ) : null}
    </div>
  );
}
