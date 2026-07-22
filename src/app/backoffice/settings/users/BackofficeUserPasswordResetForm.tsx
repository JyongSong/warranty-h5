"use client";

import { useState } from "react";
import { BackofficeUserActionDialog } from "./BackofficeUserActionDialog";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";

type BackofficeUserPasswordResetFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  user: {
    id: string;
    email: string;
  };
  disabled?: boolean;
};

export function BackofficeUserPasswordResetForm({
  action,
  user,
  disabled = false,
}: BackofficeUserPasswordResetFormProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsEditing(true)}
        className={getBackofficeButtonClass("primary", "sm")}
      >
        비밀번호 재설정
      </button>

      {isEditing ? (
        <BackofficeUserActionDialog
          action={action}
          title="비밀번호 재설정"
          description={
            <>
              <span className="font-medium text-slate-900">{user.email}</span>의 로그인 비밀번호를 변경합니다.
            </>
          }
          submitLabel="재설정하기"
          onClose={() => setIsEditing(false)}
        >
          <input type="hidden" name="id" value={user.id} />
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">새 비밀번호</span>
            <input
              name="newPassword"
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              className="h-11 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">새 비밀번호 확인</span>
            <input
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="h-11 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
        </BackofficeUserActionDialog>
      ) : null}
    </>
  );
}
