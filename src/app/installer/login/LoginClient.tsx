"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestInstallerOtpAction, verifyInstallerOtpAction } from "./actions";
import * as ui from "../ui";

const MSG: Record<string, string> = {
  INVALID_PHONE: "전화번호를 확인해 주세요.",
  INVALID_INPUT: "입력값을 확인해 주세요.",
  INSTALLER_NOT_FOUND: "등록된 기사 번호가 아닙니다. 본사에 문의해 주세요.",
  TOO_MANY_REQUESTS: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  RESEND_TOO_SOON: "잠시 후 다시 요청해 주세요.",
  CODE_EXPIRED: "인증번호가 만료되었습니다. 다시 받아 주세요.",
  CODE_MISMATCH: "인증번호가 일치하지 않습니다.",
  TOO_MANY_ATTEMPTS: "시도 횟수를 초과했습니다. 인증번호를 다시 받아 주세요.",
  DEFAULT: "오류가 발생했습니다. 다시 시도해 주세요.",
};

export default function LoginClient({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  const codeOk = code.replace(/\D/g, "").length === 6;

  async function requestCode() {
    setBusy(true);
    setError(null);
    const res = await requestInstallerOtpAction(phone);
    setBusy(false);
    if (res.ok) setStep("code");
    else setError(MSG[res.error] ?? MSG.DEFAULT);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await verifyInstallerOtpAction(phone, code);
    setBusy(false);
    if (res.ok) router.replace(redirectUrl);
    else setError(MSG[res.error] ?? MSG.DEFAULT);
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <h1 style={ui.h1}>기사 로그인</h1>
        <p style={ui.sub}>등록된 휴대폰 번호로 인증번호를 받아 로그인합니다.</p>

        <div style={ui.card}>
          <label style={ui.label}>휴대폰 번호</label>
          <input
            style={ui.input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="010-1234-5678"
            disabled={step === "code"}
          />

          {step === "code" ? (
            <>
              <label style={{ ...ui.label, marginTop: 16 }}>인증번호 6자리</label>
              <input
                style={ui.input}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
                maxLength={6}
              />
            </>
          ) : null}

          {error ? <div style={ui.errorText}>{error}</div> : null}

          <div style={{ marginTop: 16 }}>
            {step === "phone" ? (
              <button style={ui.primaryButton(!phoneOk || busy)} disabled={!phoneOk || busy} onClick={requestCode}>
                {busy ? "전송 중…" : "인증번호 받기"}
              </button>
            ) : (
              <>
                <button style={ui.primaryButton(!codeOk || busy)} disabled={!codeOk || busy} onClick={verify}>
                  {busy ? "확인 중…" : "확인하고 로그인"}
                </button>
                <div style={{ height: 10 }} />
                <button
                  style={ui.secondaryButton}
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                    setError(null);
                  }}
                >
                  번호 다시 입력
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
