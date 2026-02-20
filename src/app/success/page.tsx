"use client";

import { useEffect, useState } from "react";

export default function SuccessPage() {
  const [link, setLink] = useState("");
  const [regId, setRegId] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setLink(sessionStorage.getItem("lastConfirmLink") || "");
    setRegId(sessionStorage.getItem("lastRegistrationId") || "");
  }, []);

  async function onResend() {
    if (!regId) {
      setMsg("등록 ID가 없어 재전송할 수 없습니다. (이전 화면에서 다시 등록해 주세요.)");
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: regId }),
      });
      const j = await r.json();

      if (!r.ok) {
        // 后端可能返回 ALREADY_CONFIRMED 等错误码，这里先简单显示
        setMsg(j?.error ? `재전송에 실패했습니다. (${j.error})` : "재전송에 실패했습니다.");
        return;
      }

      setLink(j.confirmLink);
      sessionStorage.setItem("lastConfirmLink", j.confirmLink);
      setMsg("확인 링크를 재전송했습니다. (현재는 테스트 모드로 링크가 화면에 표시됩니다.)");
    } catch (e: any) {
      setMsg(e?.message ?? "재전송에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>제출 완료 ✅</h1>

      <p style={{ opacity: 0.85, lineHeight: 1.6 }}>
        설치 기사님께 설치 완료 확인 링크를 문자로 전송했습니다. 문자를 받지 못하셨다면 아래 버튼으로 재전송해 주세요.
      </p>

      {msg && (
        <div style={{ background: "#f6f7f9", padding: 12, borderRadius: 10, fontSize: 14 }}>
          {msg}
        </div>
      )}

      <button
        onClick={onResend}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "none",
          fontSize: 15,
          fontWeight: 700,
          marginTop: 12,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "전송 중..." : "확인 링크 재전송"}
      </button>

      {/* 테스트 단계에서만 링크 노출 (운영에서는 제거 권장) */}
      {link && (
        <p style={{ marginTop: 12, wordBreak: "break-all", fontSize: 13 }}>
          테스트용 확인 링크: <a href={link}>{link}</a>
        </p>
      )}
    </div>
  );
}