"use client";

import { useId, type ReactNode } from "react";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import BackofficeFormSubmitButton from "../../BackofficeFormSubmitButton";

type BackofficeUserActionDialogProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelAutoFocus?: boolean;
  children: ReactNode;
  description: ReactNode;
  onClose: () => void;
  submitDisabled?: boolean;
  submitLabel: string;
  tone?: "default" | "danger";
  title: string;
};

export function BackofficeUserActionDialog({
  action,
  cancelAutoFocus = false,
  children,
  description,
  onClose,
  submitDisabled = false,
  submitLabel,
  tone = "default",
  title,
}: BackofficeUserActionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <form action={action}>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-slate-950">
              {title}
            </h2>
            <div id={descriptionId} className="mt-1 text-sm text-slate-600">
              {description}
            </div>
          </div>

          <div className="grid gap-4 px-5 py-5">{children}</div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              autoFocus={cancelAutoFocus}
              className={getBackofficeButtonClass("secondary", "lg")}
            >
              취소
            </button>
            <BackofficeFormSubmitButton
              disabled={submitDisabled}
              label={submitLabel}
              pendingLabel="저장 중..."
              className={getBackofficeButtonClass(tone === "danger" ? "danger" : "primary", "lg")}
            />
          </div>
        </form>
      </section>
    </div>
  );
}
