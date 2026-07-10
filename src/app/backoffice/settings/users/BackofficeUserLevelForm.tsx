"use client";

import { useState } from "react";

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

  if (!isEditing) {
    return (
      <div className="flex min-h-9 items-center gap-2">
        <span className="w-24 text-sm font-medium text-slate-950">{user.level}</span>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold whitespace-nowrap text-slate-900 transition hover:bg-slate-50"
        >
          편집
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="id" value={user.id} />
      <input
        name="level"
        type="number"
        min="0"
        step="1"
        required
        value={level}
        onChange={(event) => setLevel(event.target.value)}
        aria-label={`${user.email} 레벨`}
        className="h-9 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
      <button
        type="submit"
        disabled={level === String(user.level)}
        className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold whitespace-nowrap text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
      >
        저장
      </button>
      <button
        type="button"
        onClick={cancelEditing}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold whitespace-nowrap text-slate-600 transition hover:bg-slate-50"
      >
        취소
      </button>
    </form>
  );
}
