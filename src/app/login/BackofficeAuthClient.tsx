"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { getErrorMessage } from "@/lib/error";

export function getSafeBackofficeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/";
  }

  if (nextPath.startsWith("//")) {
    return "/";
  }

  if (
    nextPath.startsWith("/login") ||
    nextPath.startsWith("/auth")
  ) {
    return "/";
  }

  return nextPath;
}


export default function BackofficeAuthClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = getSafeBackofficeNextPath(searchParams.get("redirect_url"));

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "로그인에 실패했습니다.");
      }

      window.location.assign(nextPath);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "로그인에 실패했습니다."));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950">
      <div className="mx-auto w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">로그인</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            백오피스 계정 정보를 입력하여 로그인해 주세요.
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleLogin}>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-700">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-500"
              autoComplete="email"
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-700">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-500"
              autoComplete="current-password"
              required
            />
          </label>

          <StatusMessage error={error} />

          <LoadingButton
            type="submit"
            loading={loading}
            loadingLabel="로그인 중..."
            className="h-11 rounded-md bg-zinc-950 text-sm font-semibold text-white disabled:opacity-50"
          >
            로그인
          </LoadingButton>
        </form>
      </div>
    </div>
  );
}

function StatusMessage({
  error,
}: {
  error: string | null;
}) {
  if (error) {
    return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  }

  return null;
}
