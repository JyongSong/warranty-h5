"use client";

import { useState } from "react";
import { BackofficeUserActionDialog } from "./BackofficeUserActionDialog";
import { BackofficeLevelSelect } from "./BackofficeLevelSelect";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import { BACKOFFICE_LEVEL } from "@/lib/login/backofficeRoles";

type BackofficeUserEditFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  mode: "edit" | "approve";
  user: {
    id: string;
    email: string;
    name: string | null;
    level: number;
  };
};

// 등급·이름 편집. 승인 대기 유저에게는 같은 폼을 "승인" 으로 쓴다.
export function BackofficeUserEditForm({ action, mode, user }: BackofficeUserEditFormProps) {
  const initialLevel = mode === "approve" ? "" : String(user.level);
  const [isEditing, setIsEditing] = useState(false);
  const [level, setLevel] = useState(initialLevel);
  const [name, setName] = useState(user.name ?? "");

  function cancelEditing() {
    setLevel(initialLevel);
    setName(user.name ?? "");
    setIsEditing(false);
  }

  const unchanged = level === String(user.level) && name.trim() === (user.name ?? "");
  const approving = mode === "approve";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={getBackofficeButtonClass("primary", "sm")}
      >
        {approving ? "승인" : "편집"}
      </button>

      {isEditing ? (
        <BackofficeUserActionDialog
          action={action}
          title={approving ? "가입 승인" : "유저 편집"}
          description={
            <>
              <span className="font-medium text-slate-900">{user.email}</span>
              {approving ? " 의 가입을 승인합니다. 이름과 등급을 정해 주세요." : " 의 이름과 등급을 변경합니다."}
            </>
          }
          submitLabel={approving ? "승인하기" : "변경하기"}
          submitDisabled={!level || !name.trim() || (!approving && unchanged)}
          onClose={cancelEditing}
        >
          <input type="hidden" name="id" value={user.id} />
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">이름</span>
            <input
              name="name"
              type="text"
              required
              maxLength={50}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="홍길동"
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <BackofficeLevelSelect value={level} onChange={setLevel} />
          {user.level === BACKOFFICE_LEVEL.SUPER_ADMIN && level !== String(BACKOFFICE_LEVEL.SUPER_ADMIN) ? (
            <p className="text-xs text-amber-700">최고 관리자 권한을 낮추면 유저 관리와 설정을 쓸 수 없게 됩니다.</p>
          ) : null}
        </BackofficeUserActionDialog>
      ) : null}
    </>
  );
}
