import BackofficePageHeader from "./BackofficePageHeader";

export default function BackofficeLoading() {
  return (
    <section className="min-h-[16rem] px-6 py-7 lg:px-8" aria-busy="true">
      <BackofficePageHeader title="페이지를 불러오는 중" />
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="text-sm font-medium text-zinc-600">
          페이지를 불러오는 중입니다.
        </div>
      </div>
    </section>
  );
}
