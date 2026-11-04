"use client";

import { useState } from "react";
import { BackofficeUserActionDialog } from "./BackofficeUserActionDialog";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";

type DeleteBackofficeUserFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  userEmail: string;
  // 승인 대기 유저의 가입 거절에도 같은 폼을 쓴다.
  mode?: "delete" | "reject";
};

export function DeleteBackofficeUserForm({
  action,
  userId,
  userEmail,
  mode = "delete",
}: DeleteBackofficeUserFormProps) {
  const rejecting = mode === "reject";
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={getBackofficeButtonClass("dangerSecondary", "sm")}
      >
        {rejecting ? "거절" : "삭제"}
      </button>

      {isOpen ? (
        <BackofficeUserActionDialog
          action={action}
          title={rejecting ? "가입 거절" : "유저 삭제"}
          description={
            rejecting
              ? "거절하면 가입 신청과 로그인 계정이 삭제됩니다. 다시 가입 신청할 수 있습니다."
              : "삭제하면 이 유저는 더 이상 백오피스에 로그인할 수 없습니다."
          }
          submitLabel={rejecting ? "거절하기" : "삭제하기"}
          tone="danger"
          cancelAutoFocus
          onClose={() => setIsOpen(false)}
        >
          <input type="hidden" name="id" value={userId} />
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-semibold">{userEmail}</span>{" "}
            {rejecting ? "의 가입 신청을 거절하시겠습니까?" : "유저를 삭제하시겠습니까?"}
          </div>
        </BackofficeUserActionDialog>
      ) : null}
    </>
  );
}
