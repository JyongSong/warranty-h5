"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { changeBackofficePasswordAction } from "@/app/login/actions";
import { getBackofficeButtonClass } from "./backoffice-button-styles";

const errorMessages: Record<string, string> = {
  CURRENT_PASSWORD_REQUIRED: "현재 비밀번호를 입력해 주세요.",
  NEW_PASSWORD_REQUIRED: "새 비밀번호를 입력해 주세요.",
  PASSWORD_CONFIRMATION_MISMATCH: "새 비밀번호가 서로 일치하지 않습니다.",
  CURRENT_PASSWORD_INVALID: "현재 비밀번호가 올바르지 않습니다.",
  PASSWORD_UNCHANGED: "현재 비밀번호와 다른 비밀번호를 입력해 주세요.",
  PASSWORD_TOO_WEAK: "새 비밀번호가 보안 기준을 충족하지 않습니다.",
  PASSWORD_CHANGE_RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  REAUTHENTICATION_REQUIRED: "보안을 위해 로그아웃 후 다시 로그인해 주세요.",
  UNAUTHORIZED: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
  PASSWORD_CHANGE_FAILED: "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export default function BackofficePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function closeDialog() {
    if (!loading) onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(errorMessages.PASSWORD_CONFIRMATION_MISMATCH);
      return;
    }

    setLoading(true);

    try {
      const result = await changeBackofficePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (!result.ok) {
        const errorCode = result.error;
        setError(errorMessages[errorCode] ?? errorMessages.PASSWORD_CHANGE_FAILED);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch {
      setError(errorMessages.PASSWORD_CHANGE_FAILED);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/35 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-dialog-title"
        className="w-full max-w-md rounded-md bg-white shadow-xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeDialog();
        }}
      >
        <form onSubmit={handleSubmit}>
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 id="password-dialog-title" className="text-lg font-semibold text-zinc-950">
              비밀번호 변경
            </h2>
            <p className="mt-1 text-sm text-zinc-600">현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.</p>
          </div>

          <div className="grid gap-4 px-5 py-5">
            {success ? (
              <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                비밀번호가 변경되었습니다.
              </div>
            ) : (
              <>
                <PasswordField
                  label="현재 비밀번호"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  disabled={loading}
                  autoFocus
                />
                <PasswordField
                  label="새 비밀번호"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <PasswordField
                  label="새 비밀번호 확인"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </>
            )}

            {error ? (
              <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4">
            {success ? (
              <button
                type="button"
                onClick={closeDialog}
                className={getBackofficeButtonClass("primary")}
              >
                확인
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={loading}
                  className={getBackofficeButtonClass("secondary")}
                >
                  취소
                </button>
                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingLabel="변경 중..."
                  className={getBackofficeButtonClass("primary")}
                >
                  변경하기
                </LoadingButton>
              </>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        required
        className="h-11 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-500 disabled:bg-zinc-100"
      />
    </label>
  );
}
