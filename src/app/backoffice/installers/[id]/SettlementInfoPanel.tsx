"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SETTLEMENT_INFO_STATUS_LABEL,
  TAX_DOC_TYPE_LABEL,
  formatBusinessNumber,
} from "@/lib/installer/settlement-info-shared";
import type { SettlementInfoView } from "@/lib/installer/settlement-info";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import { reviewSettlementInfoAction } from "./settlement-info-actions";

const STATUS_CLASS: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
};

const ERR: Record<string, string> = {
  REJECT_REASON_REQUIRED: "반려 사유를 입력해 주세요.",
  NOT_FOUND: "등록된 정산 정보가 없습니다.",
};

export default function SettlementInfoPanel({
  installerId,
  info,
  canManage,
}: {
  installerId: string;
  info: SettlementInfoView | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function review(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await reviewSettlementInfoAction({ installerId, approve, rejectReason: reason });
      if (!res.ok) setError(ERR[res.error] ?? res.error);
      else {
        setRejecting(false);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-800">정산 정보</h3>
        {info ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASS[info.status] ?? ""}`}>
            {SETTLEMENT_INFO_STATUS_LABEL[info.status] ?? info.status}
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-500">미등록</span>
        )}
      </div>

      {!info ? (
        <p className="text-sm text-zinc-500">기사가 앱의 「내 정보 → 정산 정보 등록」에서 아직 제출하지 않았습니다.</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item
              label="증빙 종류"
              value={info.taxDocType ? TAX_DOC_TYPE_LABEL[info.taxDocType] ?? info.taxDocType : "미선택 (선택 항목 숨김 중)"}
              strong={Boolean(info.taxDocType)}
            />
            <Item label="사업자등록번호" value={formatBusinessNumber(info.businessNumber)} />
            <Item label="상호" value={info.businessName} />
            <Item label="대표자" value={info.representativeName} />
            <Item label="이메일" value={info.invoiceEmail ?? "-"} />
            <Item label="은행" value={info.bankName} />
            <Item label="계좌번호" value={info.accountNumber ?? "(복호화 실패)"} />
            <Item label="예금주" value={info.accountHolder} />
            <Item label="제출" value={fmt(info.submittedAt)} />
            <Item label="확인" value={info.reviewedAt ? fmt(info.reviewedAt) : "-"} />
          </dl>

          {info.status === "REJECTED" && info.rejectReason ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">반려 사유: {info.rejectReason}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Photo label="사업자등록증" url={info.businessLicensePhotoUrl} />
            <Photo label="통장 사본" url={info.bankbookPhotoUrl} />
          </div>

          <p className="text-xs text-zinc-500">
            확인할 것: 예금주 = 대표자 또는 상호 · 사업자등록증의 과세유형(간이과세자면 현금영수증) · 홈택스 휴폐업 조회
          </p>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {canManage ? (
            rejecting ? (
              <div className="flex flex-wrap items-end gap-2">
                <input
                  className="min-w-[16rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="반려 사유 (기사 앱에 그대로 보입니다)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button className={getBackofficeButtonClass("danger", "sm")} disabled={pending} onClick={() => review(false)}>
                  반려 확정
                </button>
                <button className={getBackofficeButtonClass("secondary", "sm")} disabled={pending} onClick={() => setRejecting(false)}>
                  취소
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {info.status !== "APPROVED" ? (
                  <button className={getBackofficeButtonClass("primary", "sm")} disabled={pending} onClick={() => review(true)}>
                    승인
                  </button>
                ) : null}
                <button className={getBackofficeButtonClass("secondary", "sm")} disabled={pending} onClick={() => setRejecting(true)}>
                  반려
                </button>
              </div>
            )
          ) : null}
        </div>
      )}
    </section>
  );
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 break-all ${strong ? "font-bold text-zinc-900" : "text-zinc-800"}`}>{value}</dd>
    </div>
  );
}

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs text-zinc-500">{label}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="h-48 w-full rounded-lg border border-zinc-200 bg-zinc-50 object-contain" />
        </a>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400">
          사진을 불러오지 못했습니다
        </div>
      )}
    </div>
  );
}

const fmt = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
