"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  token: string;
};

export default function ConfirmClient({ token }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasToken = useMemo(() => typeof token === "string" && token.trim().length > 0, [token]);

  useEffect(() => {
    if (!hasToken) {
      // 这里就是你截图里的“缺少确认 token”
      setError("缺少确认 token");
    } else {
      setError(null);
    }
  }, [hasToken]);

  async function onConfirm() {
    if (!hasToken) return;

    setConfirming(true);
    setError(null);

    try {
      const r = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setError(data?.error ?? "确认失败");
        return;
      }

      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? "确认失败");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>설치 완료 확인</h1>

      {/* 调试信息：确认线上到底有没有拿到 token（可保留/可删） */}
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
        token length: {token?.length ?? 0}
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fdecec",
            color: "#7a1b1b",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>데이터를 불러올 수 없습니다</div>
          <div>{error}</div>
        </div>
      ) : null}

      {done ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#eef8ee",
            color: "#1d5e1d",
          }}
        >
          확인 완료 ✅
        </div>
      ) : (
        <button
          onClick={onConfirm}
          disabled={!hasToken || confirming}
          style={{
            height: 44,
            width: "100%",
            fontWeight: 800,
            opacity: !hasToken || confirming ? 0.6 : 1,
            cursor: !hasToken || confirming ? "not-allowed" : "pointer",
          }}
        >
          {confirming ? "확인 중..." : "확인"}
        </button>
      )}
    </div>
  );
}