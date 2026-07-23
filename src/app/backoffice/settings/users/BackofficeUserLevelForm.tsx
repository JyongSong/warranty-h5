"use client";

import { useState } from "react";
import { BackofficeUserActionDialog } from "./BackofficeUserActionDialog";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";

type BackofficeUserLevelFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  user: {
    id: string;
    email: string;
    level: number;
  };
};

export function BackofficeUserLevelForm({ action, user }: BackofficeUserLevelFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [level, setLevel] = useState(String(user.level));

  function cancelEditing() {
    setLevel(String(user.level));
    setIsEditing(false);
  }

  return (
    <div className="flex min-h-9 items-center gap-2">
      <span className="w-24 text-sm font-medium text-slate-950">{user.level}</span>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={getBackofficeButtonClass("primary")}
      >
        편집
      </button>

      {isEditing ? (
        <BackofficeUserActionDialog
          action={action}
          title="레벨 편집"
          description={
            <>
              <span className="font-medium text-slate-900">{user.email}</span>의 접근 레벨을 변경합니다.
            </>
          }
          submitLabel="변경하기"
          submitDisabled={level === String(user.level)}
          onClose={cancelEditing}
        >
          <input type="hidden" name="id" value={user.id} />
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">레벨</span>
            <input
              name="level"
              type="number"
              min="0"
              step="1"
              required
              autoFocus
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
        </BackofficeUserActionDialog>
      ) : null}
    </div>
  );
}
