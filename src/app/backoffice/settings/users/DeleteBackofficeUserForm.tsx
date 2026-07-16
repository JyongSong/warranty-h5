"use client";

import { useState } from "react";
import { BackofficeUserActionDialog } from "./BackofficeUserActionDialog";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";

type DeleteBackofficeUserFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  userEmail: string;
};

export function DeleteBackofficeUserForm({ action, userId, userEmail }: DeleteBackofficeUserFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={getBackofficeButtonClass("dangerSecondary", "sm")}
      >
        삭제
      </button>

      {isOpen ? (
        <BackofficeUserActionDialog
          action={action}
          title="유저 삭제"
          description="삭제하면 이 유저는 더 이상 백오피스에 로그인할 수 없습니다."
          submitLabel="삭제하기"
          tone="danger"
          cancelAutoFocus
          onClose={() => setIsOpen(false)}
        >
          <input type="hidden" name="id" value={userId} />
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-semibold">{userEmail}</span> 유저를 삭제하시겠습니까?
          </div>
        </BackofficeUserActionDialog>
      ) : null}
    </>
  );
}
