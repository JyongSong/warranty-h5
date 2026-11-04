"use client";

import { useState } from "react";
import Link from "next/link";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { requestSignupOtpAction, signUpBackofficeAction, verifySignupOtpAction } from "./actions";

// 문자 인증이 무효가 돼 다시 인증받아야 하는 에러 (otp.ts 의 에러 코드)
const REVERIFY_ERRORS = new Set(["PHONE_NOT_VERIFIED", "VERIFIED_PHONE_MISMATCH", "VERIFICATION_EXPIRED"]);

const INPUT_CLASS =
  "h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500";

export default function SignupClient() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [codeSent, setCodeSent] = useState(false);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSendCode() {
    setBusy("send");
    setError(null);
    setNotice(null);
    const result = await requestSignupOtpAction(phone);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCodeSent(true);
    setNotice("인증번호를 보냈습니다. 5분 안에 입력해 주세요.");
  }

  async function handleVerifyCode() {
    setBusy("verify");
    setError(null);
    setNotice(null);
    const result = await verifySignupOtpAction(phone, code);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setVerifiedToken(result.verifiedToken);
    setNotice("휴대폰 인증이 완료되었습니다.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verifiedToken) {
      setError("휴대폰 인증을 먼저 완료해 주세요.");
      return;
    }
    setBusy("submit");
    setError(null);
    setNotice(null);
    const result = await signUpBackofficeAction({
      email,
      phone,
      verifiedToken,
      password,
      confirmPassword,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      if (!REVERIFY_ERRORS.has(result.error)) return;
      setVerifiedToken(null);
      setCodeSent(false);
      setCode("");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">가입 신청 완료</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          관리자가 승인하면 백오피스를 이용할 수 있습니다. 승인 후 아래에서 로그인해 주세요.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white"
        >
          로그인 화면으로
        </Link>
      </Shell>
    );
  }

  const phoneLocked = Boolean(verifiedToken);

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          가입 후 관리자가 승인하면 백오피스를 이용할 수 있습니다.
        </p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className={INPUT_CLASS}
            autoComplete="email"
            required
          />
        </label>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">휴대폰 번호</span>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01012345678"
              className={INPUT_CLASS}
              autoComplete="tel"
              disabled={phoneLocked}
              required
            />
            <LoadingButton
              type="button"
              onClick={handleSendCode}
              loading={busy === "send"}
              loadingLabel="발송 중"
              disabled={phoneLocked || !phone.trim() || busy !== null}
              className="h-11 shrink-0 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 disabled:opacity-50"
            >
              {codeSent ? "재발송" : "인증번호 받기"}
            </LoadingButton>
          </div>
        </div>

        {codeSent && !phoneLocked ? (
          <div className="grid gap-2">
            <span className="text-sm font-medium text-zinc-700">인증번호</span>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="6자리 숫자"
                maxLength={6}
                className={INPUT_CLASS}
                autoComplete="one-time-code"
              />
              <LoadingButton
                type="button"
                onClick={handleVerifyCode}
                loading={busy === "verify"}
                loadingLabel="확인 중"
                disabled={code.trim().length !== 6 || busy !== null}
                className="h-11 shrink-0 rounded-md bg-zinc-800 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                확인
              </LoadingButton>
            </div>
          </div>
        ) : null}

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8자 이상"
            className={INPUT_CLASS}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">비밀번호 확인</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={INPUT_CLASS}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {notice ? (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
        ) : null}
        {error ? (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <LoadingButton
          type="submit"
          loading={busy === "submit"}
          loadingLabel="가입 중..."
          disabled={!verifiedToken || busy !== null}
          className="h-11 rounded-md bg-zinc-950 text-sm font-semibold text-white disabled:opacity-50"
        >
          가입 신청
        </LoadingButton>
      </form>

      <p className="mt-5 text-center text-sm text-zinc-600">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-zinc-950 underline underline-offset-2">
          로그인
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950">
      <div className="mx-auto w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
