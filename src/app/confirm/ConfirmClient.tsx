"use client";

import { useEffect, useState } from "react";

type RegInfo = {
  snMasked: string;
  installDate: string;
  userPhoneMasked: string;
  status: "submitted" | "confirmed" | "void";
  tokenExpired: boolean;
  confirmedAt?: string | null;
};

export default function ConfirmClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<RegInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/registration?t=${encodeURIComponent(token)}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j?.error ?? "加载失败");
        setInfo(null);
        return;
      }
      setInfo(j.data);
    } catch (e: any) {
      setError(e?.message ?? "加载失败");
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setError("缺少确认 token");
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onConfirm() {
    if (!token) return;
    setConfirming(true);
    try {
      const r = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error ?? "确认失败");
        return;
      }

      // ✅ confirm 后 token 已清空，所以不要再 load()
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              status: "confirmed",
              tokenExpired: true,
              confirmedAt: new Date().toISOString(),
            }
          : prev
      );
    } finally {
      setConfirming(false);
    }
  }

  const canConfirm =
    info &&
    info.status !== "confirmed" &&
    info.status !== "void" &&
    !info.tokenExpired &&
    !confirming;

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        설치 완료 확인
      </h1>

      {loading && <div style={{ opacity: 0.7 }}>로딩 중...</div>}

      {!loading && error && (
        <div style={{ background: "#fee", padding: 12, borderRadius: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            데이터를 불러올 수 없습니다
          </div>
          <div style={{ fontSize: 14 }}>{error}</div>
        </div>
      )}

      {!loading && info && (
        <div style={{ display: "grid", gap: 10 }}>
          <InfoCard k="기기 S/N" v={info.snMasked} />
          <InfoCard k="설치 날짜" v={info.installDate} />
          <InfoCard k="고객 연락처" v={info.userPhoneMasked} />
          <InfoCard k="상태" v={info.status} />

          {info.tokenExpired && info.status !== "confirmed" && (
            <div
              style={{
                background: "#fff7e6",
                padding: 12,
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              확인 링크가 만료되었습니다. 고객에게 재등록을 요청하시거나 AS 담당자에게
              재전송을 요청해 주세요.
            </div>
          )}

          {info.status === "confirmed" && (
            <div
              style={{
                background: "#eefaf0",
                padding: 12,
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              확인 완료 ✅
              {info.confirmedAt ? (
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  확인 시간: {info.confirmedAt}
                </div>
              ) : null}
            </div>
          )}

          <button
            disabled={!canConfirm}
            onClick={onConfirm}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              fontSize: 15,
              fontWeight: 700,
              opacity: canConfirm ? 1 : 0.5,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {confirming ? "확인 중..." : "설치 완료 확인"}
          </button>

          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            확인 버튼을 누르면 설치 날짜 기준으로 무상 AS 기간이 적용됩니다.
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{k}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
        {v || "-"}
      </div>
    </div>
  );
}