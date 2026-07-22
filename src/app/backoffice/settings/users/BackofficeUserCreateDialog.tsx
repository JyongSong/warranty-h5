"use client";

import { useState } from "react";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import BackofficeFormSubmitButton from "../../BackofficeFormSubmitButton";

type BackofficeUserCreateDialogProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function BackofficeUserCreateDialog({ action }: BackofficeUserCreateDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  function closeDialog() {
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={getBackofficeButtonClass("primary", "lg")}
      >
        유저 추가
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-dialog-title"
            aria-describedby="create-user-dialog-description"
            className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeDialog();
            }}
          >
            <form action={action}>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 id="create-user-dialog-title" className="text-lg font-semibold text-slate-950">
                  유저 추가
                </h2>
                <p id="create-user-dialog-description" className="mt-1 text-sm text-slate-600">
                  이메일, 초기 권한과 로그인 비밀번호를 입력해 주세요.
                </p>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">이메일</span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="user@example.com"
                    className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">레벨</span>
                  <input
                    name="level"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue="1"
                    className="h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="grid gap-2 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">초기 비밀번호</span>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="grid gap-2 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">초기 비밀번호 확인</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className={getBackofficeButtonClass("secondary", "lg")}
                >
                  취소
                </button>
                <BackofficeFormSubmitButton
                  label="추가하기"
                  pendingLabel="추가 중..."
                  className={getBackofficeButtonClass("primary", "lg")}
                />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
