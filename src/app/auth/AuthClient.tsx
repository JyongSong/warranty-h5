"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getErrorMessage } from "@/lib/error";

export default function AuthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = searchParams.get("next") || "/installers";
  const forbidden = searchParams.get("error") === "forbidden";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(data?.error ?? "로그인에 실패했습니다.");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "로그인에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ede7dc_0%,#fbfaf7_50%,#ffffff_100%)] px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-md rounded-[2rem] border border-black/10 bg-white/90 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
        <div className="mb-6">
          <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Protected Access</div>
          <h1 className="mt-2 text-3xl font-semibold">관리자 로그인</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            기사 관리와 설치 정보 조회는 고정 로그인 코드 입력 후 접근할 수 있습니다.
          </p>
        </div>

        {forbidden ? (
          <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            현재 계정으로는 해당 기능에 접근할 수 없습니다.
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-700">로그인 코드</span>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="관리자 코드를 입력해 주세요"
              className="h-12 rounded-2xl border border-zinc-200 px-4 outline-none transition focus:border-zinc-400"
            />
          </label>

          {error ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-2xl bg-[#1d3129] text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
