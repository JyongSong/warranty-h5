import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-16">
      <section className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-500">404</div>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">페이지를 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          주소가 변경되었거나 더 이상 제공하지 않는 페이지입니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            홈으로 이동
          </Link>
        </div>
      </section>
    </main>
  );
}
