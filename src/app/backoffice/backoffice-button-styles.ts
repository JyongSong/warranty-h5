export type BackofficeButtonVariant = "primary" | "secondary" | "danger" | "dangerSecondary";
export type BackofficeButtonSize = "sm" | "md" | "lg";

const baseClass =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const variantClass: Record<BackofficeButtonVariant, string> = {
  primary: "bg-zinc-950 text-white hover:bg-zinc-800 focus-visible:outline-zinc-950",
  secondary:
    "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-zinc-950",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  dangerSecondary:
    "border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-600",
};

const sizeClass: Record<BackofficeButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-10 px-4 text-sm",
};

export function getBackofficeButtonClass(
  variant: BackofficeButtonVariant = "primary",
  size: BackofficeButtonSize = "md",
) {
  return `${baseClass} ${variantClass[variant]} ${sizeClass[size]}`;
}
