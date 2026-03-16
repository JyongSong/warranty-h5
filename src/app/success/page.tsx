"use client";

import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";

export default function SuccessPage() {
  const [link, setLink] = useState("");
  const [regId, setRegId] = useState("");
  const [installType, setInstallType] = useState("");
  const [freeAsEndDate, setFreeAsEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isSelfInstall = installType === "self";

  useEffect(() => {
    setLink(sessionStorage.getItem("lastConfirmLink") || "");
    setRegId(sessionStorage.getItem("lastRegistrationId") || "");
    setInstallType(sessionStorage.getItem("lastInstallType") || "");
    setFreeAsEndDate(sessionStorage.getItem("lastFreeAsEndDate") || "");
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
    } catch (error: unknown) {
      setMsg(getErrorMessage(error, "재전송에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>제출 완료 ✅</h1>

      <p style={{ opacity: 0.85, lineHeight: 1.6 }}>
        {isSelfInstall
          ? "자가 설치로 접수되어 즉시 확인 완료 처리되었습니다."
          : "설치 기사님께 설치 완료 확인 링크를 문자로 전송했습니다. 문자를 받지 못하셨다면 아래 버튼으로 재전송해 주세요."}
      </p>

      {freeAsEndDate ? (
        <div
          style={{
            background: "#f6f7f9",
            padding: 12,
            borderRadius: 10,
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          <div>
            <strong>무상 A/S 종료일:</strong> {freeAsEndDate}
          </div>
          {isSelfInstall ? (
            <div style={{ marginTop: 6, color: "#8a4b00" }}>
              설치로 발생한 불량은 무상 AS 어려울 수 있습니다.
            </div>
          ) : null}
        </div>
      ) : null}

      {msg && (
        <div style={{ background: "#f6f7f9", padding: 12, borderRadius: 10, fontSize: 14 }}>
          {msg}
        </div>
      )}

      {!isSelfInstall ? (
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
      ) : null}

      {!isSelfInstall && link && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
            테스트용 확인 링크:
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              id="confirmLinkInput"
              value={link}
              readOnly
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMsg("링크를 복사했습니다.");
                } catch {
                  const el = document.getElementById("confirmLinkInput") as HTMLInputElement | null;
                  el?.focus();
                  el?.select();
                  document.execCommand("copy");
                  setMsg("링크를 복사했습니다.");
                }
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                minWidth: 72,
              }}
            >
              복사
            </button>
          </div>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            <a href={link} target="_blank" rel="noreferrer">
              새 창에서 열기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
