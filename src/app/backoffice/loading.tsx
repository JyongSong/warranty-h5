"use client";

import { usePathname } from "next/navigation";
import { LoadingSpinner } from "@/app/_components/LoadingIndicator";
import BackofficePageHeader from "./BackofficePageHeader";

const backofficeLoadingTitles: Array<{ href: string; title: string }> = [
  { href: "/backoffice/settings/data-import/installers", title: "설치 기사 가져오기" },
  { href: "/backoffice/settings/system-status", title: "시스템 상태" },
  { href: "/backoffice/settings/sms-templates", title: "SMS 템플릿" },
  { href: "/backoffice/settings/users", title: "유저 관리" },
  { href: "/backoffice/settings/system-settings", title: "시스템 설정" },
  { href: "/backoffice/settings/json-entities", title: "매핑/라벨 확인" },
  { href: "/backoffice/settings", title: "설정" },
  { href: "/backoffice/installation-search", title: "주문 검색" },
  { href: "/backoffice/installations", title: "설치 업무 큐" },
  { href: "/backoffice", title: "운영 현황" },
];

export function getBackofficeLoadingTitle(pathname: string | null) {
  const normalizedPathname = pathname?.split("?")[0] ?? "/backoffice";
  return (
    backofficeLoadingTitles.find(({ href }) => {
      if (href === "/backoffice") return normalizedPathname === href;
      return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
    })?.title ?? "Backoffice"
  );
}

export default function BackofficeLoading() {
  const pathname = usePathname();
  const normalizedPathname = pathname?.split("?")[0] ?? "/backoffice";

  if (normalizedPathname === "/backoffice") {
    return <BackofficeDashboardLoading />;
  }

  return (
    <section className="px-6 py-7 lg:px-8" aria-busy="true">
      <BackofficePageHeader
        title={getBackofficeLoadingTitle(pathname)}
        meta={<LoadingSpinner className="size-5" label="백오피스 로딩 중" />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="mt-4 h-7 w-16 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-zinc-200" />
        </div>
        <div className="divide-y divide-zinc-100">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid gap-3 px-4 py-4 sm:grid-cols-[160px_1fr_120px]">
              <div className="h-3 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 animate-pulse rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BackofficeDashboardLoading() {
  return (
    <div className="px-6 py-7 lg:px-8" aria-busy="true">
      <div className="max-w-6xl">
        <BackofficePageHeader
          title="운영 현황"
          meta={<div className="h-4 w-44 animate-pulse rounded bg-zinc-100" />}
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
          <section className="rounded-md border border-zinc-200 bg-white p-4" aria-label="신규 주문과 설치 완료 추이 로딩 중">
            <div className="mb-4">
              <div className="h-5 w-44 animate-pulse rounded bg-zinc-100" />
              <div className="mt-3 h-4 w-full max-w-[520px] animate-pulse rounded bg-zinc-100" />
            </div>

            <div className="h-[260px]">
              <div className="flex h-full flex-col justify-end gap-[88px] pb-10 pl-8 pr-4">
                <div className="h-px w-full bg-zinc-100" />
                <div className="h-px w-full bg-zinc-100" />
                <div className="relative h-px w-full bg-zinc-300">
                  <div className="absolute inset-x-6 -top-0.5 h-1 animate-pulse rounded-full bg-amber-200" />
                  <div className="absolute left-4 top-2 h-3 w-5 animate-pulse rounded bg-zinc-100" />
                  <div className="absolute left-1/3 top-2 h-3 w-5 animate-pulse rounded bg-zinc-100" />
                  <div className="absolute left-2/3 top-2 h-3 w-5 animate-pulse rounded bg-zinc-100" />
                  <div className="absolute right-2 top-2 h-3 w-5 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-4">
              <div className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-blue-100" />
                <span className="h-3 w-14 animate-pulse rounded bg-zinc-100" />
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-0.5 w-5 rounded bg-amber-200" />
                <span className="h-3 w-14 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4" aria-label="현재 대기 상태 분포 로딩 중">
            <div className="mb-5">
              <div className="h-5 w-36 animate-pulse rounded bg-zinc-100" />
              <div className="mt-3 h-4 w-full max-w-[320px] animate-pulse rounded bg-zinc-100" />
            </div>

            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="h-4 w-28 animate-pulse rounded bg-zinc-100" />
                    <div className="h-4 w-8 animate-pulse rounded bg-zinc-100" />
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full w-3 rounded-full bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
