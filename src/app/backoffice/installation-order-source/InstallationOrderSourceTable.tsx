"use client";

import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import BackofficeDataTable from "../BackofficeDataTable";
import BackofficePageHeader from "../BackofficePageHeader";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import { installationOrderSourceColumns } from "./InstallationOrderSourceTable.columns";

const TABLE_PREFS_KEY = "backoffice.installation-order-source.table.v3";

export default function InstallationOrderSourceTable({
  initialItems,
  errorMessage,
  from,
  to,
}: {
  initialItems: FetchedInstallationOrder[];
  errorMessage?: string;
  from: string;
  to: string;
}) {
  return (
    <section>
      <div className="px-6 py-7 lg:px-8">
        <BackofficePageHeader title="ERP 주문 데이터" />
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            데이터 처리 중 오류가 발생했습니다. {errorMessage}
          </div>
        ) : null}

        <BackofficeDataTable
          columns={installationOrderSourceColumns}
          data={initialItems}
          emptyMessage="ERP에서 조회된 설치 주문이 없습니다."
          storageKey={TABLE_PREFS_KEY}
          cellClassName="align-top overflow-hidden px-4 py-3 text-zinc-700"
          getRowId={(row) => row.source_key}
          getRowClassName={getInstallationOrderSourceRowClassName}
          renderBeforeTable={(columnControls) => (
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <form method="get" className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs font-medium text-zinc-500">
                  납기일자 시작
                  <input
                    type="date"
                    name="from"
                    defaultValue={from}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-zinc-500">
                  납기일자 종료
                  <input
                    type="date"
                    name="to"
                    defaultValue={to}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
                  />
                </label>
                <button
                  type="submit"
                  className={getBackofficeButtonClass("primary")}
                >
                  조회
                </button>
              </form>
              {columnControls}
            </div>
          )}
        />
        <p className="mt-3 text-sm font-medium text-zinc-500">{initialItems.length}건</p>
      </div>
    </section>
  );
}

function getInstallationOrderSourceRowClassName(row: FetchedInstallationOrder) {
  if (row.source_error_code) {
    return "border-b border-rose-100 bg-rose-50 last:border-0 hover:bg-rose-100";
  }

  return "border-b border-zinc-100 last:border-0 hover:bg-zinc-50";
}
