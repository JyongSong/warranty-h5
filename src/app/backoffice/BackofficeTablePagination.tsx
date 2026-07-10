"use client";

import Link from "next/link";

export type BackofficeTablePaginationModel = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  previousHref: string | null;
  nextHref: string | null;
  pageSizeLinks: Array<{
    pageSize: number;
    href: string;
  }>;
};

export function closeBackofficeTablePageSizeMenu(details: Pick<HTMLDetailsElement, "open"> | null) {
  if (!details) return;

  details.open = false;
}

export default function BackofficeTablePagination({
  pagination,
}: {
  pagination: BackofficeTablePaginationModel;
}) {
  const firstItem = pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastItem = Math.min(pagination.totalItems, pagination.page * pagination.pageSize);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
      <div>
        {firstItem}-{lastItem} / {pagination.totalItems}건
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <details className="relative">
          <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:border-zinc-500 hover:text-zinc-950">
            {pagination.pageSize}개씩 보기
          </summary>
          <div className="absolute right-0 bottom-10 z-20 w-36 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            {pagination.pageSizeLinks.map((link) => {
              const active = link.pageSize === pagination.pageSize;

              return (
                <Link
                  key={link.pageSize}
                  href={link.href}
                  onClick={(event) => closeBackofficeTablePageSizeMenu(event.currentTarget.closest("details"))}
                  className={
                    active
                      ? "block bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
                      : "block px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"
                  }
                >
                  {link.pageSize}개씩 보기
                </Link>
              );
            })}
          </div>
        </details>
        <div className="flex items-center gap-2">
          {pagination.previousHref ? (
            <Link
              href={pagination.previousHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-500 hover:text-zinc-950"
            >
              이전
            </Link>
          ) : (
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-400">
              이전
            </span>
          )}
          <span className="text-xs font-semibold text-zinc-600">
            {pagination.page} / {pagination.totalPages}
          </span>
          {pagination.nextHref ? (
            <Link
              href={pagination.nextHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-500 hover:text-zinc-950"
            >
              다음
            </Link>
          ) : (
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-400">
              다음
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
