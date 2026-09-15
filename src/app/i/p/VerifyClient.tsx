"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { formatKrPhone, normalizePhone } from "@/lib/phone";
import * as ui from "@/app/installer/ui";
import { requestProfileOtpAction, verifyProfileOtpAction } from "./actions";

// 문자 링크로 들어온 기사의 첫 화면. 휴대폰 인증만 통과하면 바로 정보 화면으로 간다.
// 기사 앱 로그인으로 보내지 않는다 — 이 링크를 받는 대부분은 앱 사용자가 아니고,
// 정보 한 번 채우자고 앱 전체에 들어갈 수 있는 세션을 줄 이유가 없다.

const ERROR_LABEL: Record<string, string> = {
  INVALID_PHONE: "휴대폰 번호를 다시 확인해 주세요.",
  INSTALLER_NOT_FOUND: "등록된 기사 번호가 아닙니다. 본사 담당자에게 문의해 주세요.",
  TOO_MANY_REQUESTS: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  RESEND_TOO_SOON: "잠시 후 다시 요청해 주세요.",
  CODE_EXPIRED: "인증번호가 만료되었습니다. 다시 받아 주세요.",
  CODE_MISMATCH: "인증번호가 맞지 않습니다.",
  TOO_MANY_ATTEMPTS: "시도 횟수를 초과했습니다. 인증번호를 다시 받아 주세요.",
  SEND_FAILED: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  VERIFY_FAILED: "인증에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export default function VerifyClient() {
  const router = useRouter();
  const [step, setStep] = useState<"PHONE" | "CODE">("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setBusy(true);
    setError(null);
    const res = await requestProfileOtpAction(normalizePhone(phone));
    setBusy(false);
    if (res.ok) {
      setStep("CODE");
      return;
    }
    setError(ERROR_LABEL[res.error] ?? ERROR_LABEL.SEND_FAILED);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await verifyProfileOtpAction(normalizePhone(phone), code.trim());
    setBusy(false);
    if (res.ok) {
      // 쿠키가 생겼으므로 같은 주소를 다시 그리면 정보 화면이 나온다.
      router.refresh();
      return;
    }
    setError(ERROR_LABEL[res.error] ?? ERROR_LABEL.VERIFY_FAILED);
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ ...ui.h1, marginBottom: 4 }}>기사 정보 확인</h1>
          <p style={sub}>
            아카라라이프 정식 설치기사로 등록되셨습니다.
            <br />
            본인 확인 후 정보를 확인·수정해 주세요.
          </p>
        </div>

        {step === "PHONE" ? (
          <div style={ui.card}>
            <label style={label}>휴대폰 번호</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="010-0000-0000"
              style={input}
            />
            <p style={hint}>명단에 등록된 번호로만 인증할 수 있습니다.</p>
            {error ? <div style={errorBox}>{error}</div> : null}
            <button
              type="button"
              onClick={requestCode}
              disabled={busy || normalizePhone(phone).length < 10}
              style={ui.primaryButton(busy || normalizePhone(phone).length < 10)}
            >
              {busy ? "발송 중…" : "인증번호 받기"}
            </button>
          </div>
        ) : (
          <div style={ui.card}>
            <label style={label}>인증번호</label>
            <div style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>
              {formatKrPhone(normalizePhone(phone))} 으로 보냈습니다. (5분 이내 입력)
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6자리"
              style={{ ...input, letterSpacing: 4, textAlign: "center", fontSize: 20 }}
            />
            {error ? <div style={errorBox}>{error}</div> : null}
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.trim().length < 6}
              style={ui.primaryButton(busy || code.trim().length < 6)}
            >
              {busy ? "확인 중…" : "확인"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("PHONE");
                setCode("");
                setError(null);
              }}
              style={{ ...ui.secondaryButton, marginTop: 8 }}
            >
              번호 다시 입력
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const sub: CSSProperties = { fontSize: 13, color: "#71717a", lineHeight: 1.7, margin: 0 };

const label: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 800,
  color: "#3f3f46",
  marginBottom: 8,
};

const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 10,
  border: "1px solid #e4e4e7",
  padding: "0 12px",
  fontSize: 16,
  color: "#18181b",
  boxSizing: "border-box",
  marginBottom: 8,
};

const hint: CSSProperties = { fontSize: 12, color: "#a1a1aa", marginBottom: 10, lineHeight: 1.5 };

const errorBox: CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  color: "#991b1b",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  marginBottom: 10,
};
