"use client";

import type { AsOriginalInstallRecord } from "@/lib/installation/as/service";

const MATCHED_ON_LABEL: Record<AsOriginalInstallRecord["matchedOn"], string> = {
  ORDER_NO: "주문번호 일치",
  PHONE: "전화번호 일치",
  ADDRESS: "주소 일치",
  CUSTOMER_NAME: "고객명 일치",
};

/**
 * 원 시공 이력 카드. ERP 원장은 담당기사를 37%만 채워 두기 때문에 대부분의
 * 카드는 "업체까지"만 말해 준다. 그래서 기사를 단정해 주는 대신, 판단 근거
 * (언제·무엇을·어느 업체가·얼마에)를 펼쳐 놓고 담당자가 고르게 한다.
 */
export default function OriginalInstallCards({
  records,
  onSelect,
  onLinkOrder,
}: {
  records: AsOriginalInstallRecord[];
  onSelect: (installer: { id: string; name: string }) => void;
  onLinkOrder?: (installationOrderId: string) => void;
}) {
  if (records.length === 0) return null;

  return (
    <div className="grid gap-2">
      {records.map((record, index) => (
        <article
          key={`${record.source}-${record.installationOrderId ?? index}`}
          className="rounded-lg border border-zinc-200 bg-white p-3"
        >
          <header className="mb-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                record.source === "DISPATCH"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {record.source === "DISPATCH" ? "배정 시스템" : "ERP 이력"}
            </span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">
              {MATCHED_ON_LABEL[record.matchedOn]}
            </span>
            {record.installDate ? (
              <span className="text-xs text-zinc-500">{record.installDate}</span>
            ) : null}
            {record.erpStatus ? (
              <span className="text-xs text-zinc-400">{record.erpStatus}</span>
            ) : null}
          </header>

          <dl className="grid gap-1 text-sm">
            <Row label="시공 업체" value={record.vendorName ?? record.branch} />
            <Row label="담당 기사" value={record.installerName} fallback="ERP 원장에 없음" />
            <Row label="품목" value={record.itemName} />
            <Row
              label="용역비"
              value={record.serviceFee == null ? null : `${record.serviceFee.toLocaleString()}원`}
            />
            <Row label="고객" value={record.customerName} />
            <Row label="주소" value={record.address} />
          </dl>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {record.installerId && record.installerName ? (
              <button
                type="button"
                className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-semibold text-white"
                onClick={() => {
                  onSelect({ id: record.installerId!, name: record.installerName! });
                  if (record.installationOrderId) onLinkOrder?.(record.installationOrderId);
                }}
              >
                {record.installerName} 지정
              </button>
            ) : null}

            {!record.installerId && record.branchInstallers.length > 0 ? (
              <>
                <span className="self-center text-xs text-zinc-500">이 업체 기사 지정:</span>
                {record.branchInstallers.map((installer) => (
                  <button
                    key={installer.id}
                    type="button"
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700"
                    onClick={() => {
                      onSelect(installer);
                      if (record.installationOrderId) onLinkOrder?.(record.installationOrderId);
                    }}
                  >
                    {installer.name}
                  </button>
                ))}
              </>
            ) : null}

            {!record.installerId && record.branchInstallers.length === 0 ? (
              <span className="text-xs text-amber-700">
                시스템에 등록된 기사가 없는 업체입니다. 직접 지정해 주세요.
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Row({ label, value, fallback = "-" }: { label: string; value: string | null; fallback?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-xs leading-5 text-zinc-500">{label}</dt>
      <dd className={`text-sm leading-5 ${value ? "text-zinc-900" : "text-zinc-400"}`}>
        {value ?? fallback}
      </dd>
    </div>
  );
}
