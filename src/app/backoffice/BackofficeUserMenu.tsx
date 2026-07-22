"use client";

import { useState } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { signOutBackofficeAction } from "@/app/login/actions";
import BackofficePasswordDialog from "./BackofficePasswordDialog";

export default function BackofficeUserMenu({
  email,
  compact = false,
  iconOnly = false,
  openUpward = false,
}: {
  email: string;
  compact?: boolean;
  iconOnly?: boolean;
  openUpward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  function openPasswordDialog() {
    setOpen(false);
    setShowPasswordDialog(true);
  }

  async function logout() {
    if (loading) return;

    setLoading(true);
    await signOutBackofficeAction().catch(() => null);
    window.location.assign("/");
  }

  return (
    <div className={["relative shrink-0", iconOnly ? "max-w-none" : compact ? "max-w-36" : "max-w-full"].join(" ")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${email} 계정 메뉴`}
        className={[
          "flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
          iconOnly ? "size-10 justify-center p-0" : compact ? "h-9 px-3" : "h-10 w-full px-3",
        ].join(" ")}
      >
        {iconOnly ? (
          <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
            <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4.5 16c.7-2.7 2.5-4 5.5-4s4.8 1.3 5.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <>
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
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute z-20 rounded-lg border border-slate-200 bg-white p-1 shadow-lg",
            iconOnly
              ? "bottom-0 left-full ml-2 min-w-40"
              : openUpward
                ? "bottom-full right-0 mb-1 min-w-full"
                : "right-0 mt-1 min-w-full",
          ].join(" ")}
        >
          <button
            type="button"
            role="menuitem"
            onClick={openPasswordDialog}
            className="flex h-8 w-full items-center justify-start whitespace-nowrap rounded border border-transparent px-3 text-left text-xs font-semibold text-slate-700 transition hover:border-slate-200 hover:bg-slate-50"
          >
            비밀번호 변경
          </button>
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

      {showPasswordDialog ? (
        <BackofficePasswordDialog onClose={() => setShowPasswordDialog(false)} />
      ) : null}
    </div>
  );
}
