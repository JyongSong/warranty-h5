"use client";

import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";

type StoredState = {
  link: string;
  regId: string;
  installType: string;
  freeAsEndDate: string;
};

const EMPTY_STATE: StoredState = {
  link: "",
  regId: "",
  installType: "",
  freeAsEndDate: "",
};

const INSTALL_TYPE_LABEL_KO: Record<string, string> = {
  self: "자가 설치",
  external: "외부 기사 설치",
  installer: "본사 공인 기사 설치",
};

export default function SuccessPage() {
  const [stored, setStored] = useState<StoredState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // sessionStorage 는 SSR 환경에서 사용 불가하므로 클라이언트 마운트 후 한 번 읽음.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored({
      link: sessionStorage.getItem("lastConfirmLink") || "",
      regId: sessionStorage.getItem("lastRegistrationId") || "",
      installType: sessionStorage.getItem("lastInstallType") || "",
      freeAsEndDate: sessionStorage.getItem("lastFreeAsEndDate") || "",
    });
  }, []);

  const { link, regId, installType, freeAsEndDate } = stored;
  // self / external: 등록 즉시 완료
  // installer:        기사 confirm 후 완료 (이 페이지에서는 컨펌 대기 안내)
  const isImmediate = installType === "self" || installType === "external";
  const isInstallerPending = installType === "installer";
  const installTypeLabel = INSTALL_TYPE_LABEL_KO[installType] ?? installType;

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
        setMsg(j?.error ? `재전송에 실패했습니다. (${j.error})` : "재전송에 실패했습니다.");
        return;
      }

      setStored((s) => ({ ...s, link: j.confirmLink }));
      sessionStorage.setItem("lastConfirmLink", j.confirmLink);
      setMsg("확인 링크를 재전송했습니다.");
    } catch (error: unknown) {
      setMsg(getErrorMessage(error, "재전송에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        {isInstallerPending ? "등록 접수 ✅" : "제품정보 등록 성공 ✅"}
      </h1>

      {/* 자가 / 외부 기사: 등록 완료 안내 */}
      {isImmediate && (
        <div style={summaryBoxStyle}>
          <div style={summaryLineStyle}>
            <strong>설치 유형:</strong> {installTypeLabel}
          </div>
          {freeAsEndDate && (
            <div style={summaryLineStyle}>
              <strong>무상 A/S 종료일:</strong> {freeAsEndDate}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 13, color: "#52525b" }}>
            등록 완료 안내 문자가 발송되었습니다.
          </div>
          {installType === "external" && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#8a4b00" }}>
              본사 공인 기사가 아니므로 시공 불량 발생 시 무상 A/S가 제한될 수 있습니다.
            </div>
          )}
          {installType === "self" && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#8a4b00" }}>
              설치로 발생한 불량은 무상 A/S 가 어려울 수 있습니다.
            </div>
          )}
        </div>
      )}

      {/* 인증 기사: 기사 confirm 대기 */}
      {isInstallerPending && (
        <>
          <p style={{ opacity: 0.85, lineHeight: 1.6 }}>
            기사님에게 컨펌 링크를 문자로 전송했습니다.
            <br />
            기사님이 링크에서 설치를 확인하시면 등록이 완료되며,
            완료 안내 문자가 자동으로 발송됩니다.
          </p>

          {freeAsEndDate && (
            <div style={summaryBoxStyle}>
              <div style={summaryLineStyle}>
                <strong>예정 무상 A/S 종료일:</strong> {freeAsEndDate}
              </div>
            </div>
          )}

          <button
            onClick={onResend}
            disabled={loading}
            style={resendBtnStyle(loading)}
          >
            {loading ? "전송 중..." : "확인 링크 재전송"}
          </button>

          {link && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                예비 확인 링크:
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="confirmLinkInput"
                  value={link}
                  readOnly
                  style={linkInputStyle}
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setMsg("링크를 복사했습니다.");
                    } catch {
                      const el = document.getElementById(
                        "confirmLinkInput"
                      ) as HTMLInputElement | null;
                      el?.focus();
                      el?.select();
                      document.execCommand("copy");
                      setMsg("링크를 복사했습니다.");
                    }
                  }}
                  style={copyBtnStyle}
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
        </>
      )}

      {msg && (
        <div style={{ background: "#f6f7f9", padding: 12, borderRadius: 10, fontSize: 14, marginTop: 12 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

const summaryBoxStyle: React.CSSProperties = {
  background: "#f6f7f9",
  padding: 14,
  borderRadius: 10,
  fontSize: 14,
  lineHeight: 1.7,
  marginBottom: 12,
};

const summaryLineStyle: React.CSSProperties = {
  marginBottom: 4,
};

function resendBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #1d3129",
    background: disabled ? "#52766a" : "#1d3129",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    marginTop: 12,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const linkInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontSize: 13,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const copyBtnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  minWidth: 72,
};
