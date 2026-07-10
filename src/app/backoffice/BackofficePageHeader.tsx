import type { ReactNode } from "react";

type BackofficePageHeaderProps = {
  title: string;
  meta?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
};

export default function BackofficePageHeader({
  title,
  meta,
  leading,
  actions,
}: BackofficePageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-5">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {leading}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">{title}</h2>
          {meta ? <div className="text-sm font-medium text-zinc-500">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
