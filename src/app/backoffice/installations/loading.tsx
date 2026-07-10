import BackofficePageHeader from "../BackofficePageHeader";

const INSTALLATION_ORDER_LOADING_COLUMN_COUNT = 7;
const INSTALLATION_ORDER_LOADING_COLUMNS = Array.from({
  length: INSTALLATION_ORDER_LOADING_COLUMN_COUNT,
});

export default function InstallationsLoading() {
  return (
    <section>
      <div className="px-6 py-7 lg:px-8">
        <BackofficePageHeader
          title="설치 업무 큐"
          meta={
            <span className="inline-flex items-center gap-2">
              <span
                aria-label="설치 주문 로딩 중"
                className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-950"
              />
              전체 진행 중
            </span>
          }
        />

        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
                <tr>
                  {INSTALLATION_ORDER_LOADING_COLUMNS.map((_, columnIndex) => (
                    <th key={columnIndex} className="border-b border-zinc-200 px-4 py-3">
                      <div
                        aria-label="컬럼 헤더 로딩 중"
                        className="h-3 w-20 animate-pulse rounded bg-zinc-200"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-zinc-100 last:border-0">
                    {Array.from({ length: INSTALLATION_ORDER_LOADING_COLUMNS.length }).map((__, columnIndex) => (
                      <td key={columnIndex} className="px-4 py-4">
                        <div className="h-3 w-full max-w-[220px] animate-pulse rounded bg-zinc-100" />
                        {columnIndex === 0 || columnIndex === 2 ? (
                          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-zinc-100" />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
