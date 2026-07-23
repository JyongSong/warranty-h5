export default function BackofficeDetailLoading() {
  return (
    <aside
      aria-busy="true"
      aria-label="설치 주문 상세 불러오는 중"
      className="h-[calc(100dvh-3.5rem)] w-full shrink-0 overflow-y-auto border-l border-zinc-200 bg-white shadow-[-12px_0_32px_rgba(24,24,27,0.08)] md:h-screen lg:w-1/2"
    />
  );
}
