"use client";

import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";

type Props = { token: string };

type Info = {
  id: string;
  sn: string;
  installDate: string;
  userPhone: string;
  installerPhone: string;
  status: string;
  tokenExpired: boolean;
};

export default function ConfirmClient({ token }: Props) {
  const [effectiveToken, setEffectiveToken] = useState(token ?? "");
  const [info, setInfo] = useState<Info | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 兜底：如果 server 没传到 token，client 从 URL 取（你之前 Vercel 域名问题阶段非常有用）
  useEffect(() => {
    if (effectiveToken && effectiveToken.trim()) return;
    try {
      const t = new URLSearchParams(window.location.search).get("t") || "";
      if (t) setEffectiveToken(t);
    } catch {}
  }, [effectiveToken]);

  const hasToken = useMemo(
    () => typeof effectiveToken === "string" && effectiveToken.trim().length > 0,
    [effectiveToken]
  );

  // 拉取详情
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!hasToken) {
        setLoadingInfo(false);
        setError("token 없음");
        return;
      }

      setLoadingInfo(true);
      setError(null);

      try {
        const r = await fetch(`/api/confirm/info?t=${encodeURIComponent(effectiveToken)}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = await r.json().catch(() => ({}));

        if (!r.ok) {
          setError(data?.error ?? "데이터를 불러올 수 없습니다");
          return;
        }

        if (!cancelled) setInfo(data);
      } catch (error: unknown) {
        if (!cancelled) setError(getErrorMessage(error, "데이터를 불러올 수 없습니다"));
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [hasToken, effectiveToken]);

  const canConfirm = useMemo(() => {
    if (!info) return false;
    if (info.tokenExpired) return false;
    if (info.status === "confirmed" || info.status === "void") return false;
    return true;
  }, [info]);

  async function onConfirm() {
    if (!hasToken) return;
    if (!canConfirm) return;

    setConfirming(true);
    setError(null);

    try {
      const r = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: effectiveToken }),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setError(data?.error ?? "확인실패");
        return;
      }

      setDone(true);
      // 可选：更新本地状态
      setInfo((prev) => (prev ? { ...prev, status: "confirmed" } : prev));
    } catch (error: unknown) {
      setError(getErrorMessage(error, "확인실패"));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>설치 완료 확인</h1>

      {/* 你调试完可以删 */}
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
        token length: {effectiveToken?.length ?? 0}
      </div>

      {error ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fdecec", color: "#7a1b1b" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>데이터를 불러올 수 없습니다</div>
          <div>{error}</div>
        </div>
      ) : null}

      {loadingInfo ? (
        <div style={{ opacity: 0.7, marginTop: 12 }}>불러오는 중...</div>
      ) : info ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>제품 S/N</div>
            <div style={{ fontWeight: 800 }}>{info.sn}</div>
          </div>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>설치일</div>
            <div style={{ fontWeight: 800 }}>{info.installDate}</div>
          </div>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>고객 전화번호</div>
            <div style={{ fontWeight: 800 }}>{info.userPhone}</div>
          </div>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>기사 전화번호</div>
            <div style={{ fontWeight: 800 }}>{info.installerPhone}</div>
          </div>

          {info.tokenExpired ? (
            <div style={{ padding: 12, borderRadius: 10, background: "#fff6e5" }}>
              확인 링크가 만료되었습니다.
            </div>
          ) : null}

          {done || info.status === "confirmed" ? (
            <div style={{ padding: 12, borderRadius: 10, background: "#eef8ee", color: "#1d5e1d" }}>
              확인 완료 ✅
            </div>
          ) : (
            <button
              onClick={onConfirm}
              disabled={!canConfirm || confirming}
              style={{
                height: 44,
                width: "100%",
                fontWeight: 800,
                opacity: !canConfirm || confirming ? 0.6 : 1,
                cursor: !canConfirm || confirming ? "not-allowed" : "pointer",
              }}
            >
              {confirming ? "확인 중..." : "확인"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
