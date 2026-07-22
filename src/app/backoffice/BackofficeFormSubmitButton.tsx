"use client";

import { useFormStatus } from "react-dom";
import { LoadingSpinner } from "@/app/_components/LoadingIndicator";

export default function BackofficeFormSubmitButton({
  className,
  disabled = false,
  label,
  pendingLabel = "처리 중...",
}: {
  className: string;
  disabled?: boolean;
  label: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${className} gap-2 ${pending ? "cursor-wait" : ""}`}
    >
      {pending ? <LoadingSpinner className="size-3.5" label={pendingLabel} /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
