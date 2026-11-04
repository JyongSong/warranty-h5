"use client";

import { useState } from "react";
import { signOutBackofficeAction } from "@/app/login/actions";

export default function PendingSignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOutBackofficeAction();
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="h-11 rounded-md border border-zinc-300 text-sm font-semibold text-zinc-700 disabled:opacity-50"
    >
      {loading ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
