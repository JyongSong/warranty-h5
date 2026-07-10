import { LoadingSpinner } from "@/app/_components/LoadingIndicator";

export default function LoginLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950" aria-busy="true">
      <div className="mx-auto w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <h1 className="text-2xl font-semibold">로그인</h1>
          <LoadingSpinner className="size-5" label="로그인 화면 로딩 중" />
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="h-4 w-14 animate-pulse rounded bg-zinc-100" />
            <div className="h-11 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" />
          </div>
          <div className="grid gap-2">
            <div className="h-4 w-16 animate-pulse rounded bg-zinc-100" />
            <div className="h-11 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" />
          </div>
          <div className="h-11 animate-pulse rounded-md bg-zinc-200" />
        </div>
      </div>
    </div>
  );
}
