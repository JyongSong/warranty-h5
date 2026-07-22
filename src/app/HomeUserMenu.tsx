"use client";

import { useState } from "react";
import { signOutBackofficeAction } from "@/app/login/actions";
import { LoadingButton } from "@/app/_components/LoadingIndicator";

export default function HomeUserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (loading) return;

    setLoading(true);
    await signOutBackofficeAction().catch(() => null);
    window.location.assign("/");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${email} 계정 메뉴`}
        className="flex max-w-52 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <span className="truncate">{email}</span>
        <span
          aria-hidden="true"
          className={[
            "size-1.5 shrink-0 border-b border-r border-current transition-transform",
            open ? "translate-y-0.5 rotate-[225deg]" : "rotate-45",
          ].join(" ")}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 min-w-full rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl shadow-slate-950/50"
        >
          <LoadingButton
            type="button"
            role="menuitem"
            onClick={logout}
            loading={loading}
            loadingLabel="로그아웃 중..."
            className="flex h-8 w-full items-center justify-start whitespace-nowrap rounded-md px-3 text-left text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            로그아웃
          </LoadingButton>
        </div>
      ) : null}
    </div>
  );
}
