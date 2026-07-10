"use client";

import type { FormEvent } from "react";

type DeleteBackofficeUserFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  userEmail: string;
  userId: string;
};

export function DeleteBackofficeUserForm({ action, userEmail, userId }: DeleteBackofficeUserFormProps) {
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!confirm(`${userEmail} 유저를 삭제할까요?`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={confirmDelete}>
      <input type="hidden" name="id" value={userId} />
      <button
        type="submit"
        className="h-9 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold whitespace-nowrap text-red-700 transition hover:bg-red-50"
      >
        삭제
      </button>
    </form>
  );
}
