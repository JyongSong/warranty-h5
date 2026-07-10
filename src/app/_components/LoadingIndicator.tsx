"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type LoadingSpinnerProps = {
  className?: string;
  label?: string;
};

export function LoadingSpinner({ className = "size-4", label = "처리 중" }: LoadingSpinnerProps) {
  return (
    <span
      aria-label={label}
      className={[
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80",
        className,
      ].join(" ")}
    />
  );
}

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export function LoadingButton({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = "처리 중",
  type = "button",
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-2",
        loading ? "cursor-wait" : "",
        className ?? "",
      ].join(" ")}
    >
      {loading ? <LoadingSpinner className="size-3.5" label={loadingLabel} /> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
