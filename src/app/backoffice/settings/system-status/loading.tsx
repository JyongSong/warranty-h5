import { LoadingSpinner } from "@/app/_components/LoadingIndicator";
import BackofficePageHeader from "../../BackofficePageHeader";

const SYSTEM_STATUS_LOADING_JOBS = ["설치 주문 동기화", "설치 Dispatcher"];
const SYSTEM_STATUS_LOADING_ROWS = [
  "자동 실행",
  "스케줄",
  "마지막 시간",
  "마지막 결과",
  "마지막 소요 시간",
];

export default function SystemStatusLoading() {
  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8" aria-busy="true">
      <BackofficePageHeader
        title="시스템 상태"
        meta={<LoadingSpinner className="size-5" label="시스템 상태 로딩 중" />}
      />

      <section className="max-w-4xl" aria-label="Cron 호출 상태 로딩 중">
        <div className="mb-5 text-sm leading-6 text-zinc-600">
          자동 작업 실행 상태
        </div>

        <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
          <table className="w-max min-w-full border-collapse text-sm whitespace-nowrap">
            <caption className="sr-only">설치 cron 작업별 마지막 실행 상태 로딩 중</caption>
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70">
                <th scope="col" className="w-28 px-4 py-3 text-left text-xs font-semibold text-zinc-500 sm:w-36">
                  항목
                </th>
                {SYSTEM_STATUS_LOADING_JOBS.map((job) => (
                  <th key={job} scope="col" className="px-4 py-3 text-left align-top">
                    <div className="font-semibold text-zinc-950">{job}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SYSTEM_STATUS_LOADING_ROWS.map((row, rowIndex) => (
                <tr key={row} className="border-b border-zinc-100 last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-left align-top text-xs font-semibold text-zinc-500">
                    {row}
                  </th>
                  {SYSTEM_STATUS_LOADING_JOBS.map((job) => (
                    <td key={job} className="px-4 py-3 align-top">
                      <div
                        className={[
                          "h-4 animate-pulse rounded bg-zinc-100",
                          rowIndex === 1 ? "w-20" : rowIndex === 2 ? "w-32" : "w-12",
                        ].join(" ")}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
