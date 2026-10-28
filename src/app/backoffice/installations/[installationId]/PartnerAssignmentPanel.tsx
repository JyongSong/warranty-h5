"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BackofficePartnerPanelData } from "@/lib/installation/partner/views";
import { formatPartnerStatus } from "@/lib/installation/partner/routing";
import PartnerNoteTimeline from "@/app/partner/orders/PartnerNoteTimeline";
import { formatClaimAmount } from "@/app/partner/orders/format";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import {
  addHqPartnerNoteAction,
  reviewPartnerCompletionAction,
  switchOrderToInhouseAction,
  switchOrderToPartnerAction,
} from "./partner-actions";

// 설치 상세 상단의 외부 협력사(PL) 패널: 배정 상태, 진행 기록, 본사 검수, 수동 전환.

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "권한이 없습니다.",
  PARTNER_NOT_CONFIGURED: "협력사(PL)가 등록되어 있지 않습니다.",
  ORDER_NOT_PARTNER_SWITCHABLE: "지금 상태에서는 협력사로 넘길 수 없습니다.",
  ORDER_NOT_INHOUSE_SWITCHABLE: "지금 상태에서는 자사 기사 배정으로 돌릴 수 없습니다.",
  ORDER_NOT_IN_REVIEW: "검수 대기 상태가 아닙니다.",
  REASON_REQUIRED: "사유를 입력해 주세요.",
  NOTE_REQUIRED: "메모 내용을 입력해 주세요.",
  NOTE_TOO_LONG: "메모가 너무 깁니다. (2000자 이하)",
};

export default function PartnerAssignmentPanel({
  installationId,
  data,
}: {
  installationId: string;
  data: BackofficePartnerPanelData;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { detail } = data;
  const assigned = Boolean(detail?.partnerStatus);
  const inReview = assigned && data.orderStatus === "WAITING_HQ_REVIEW";

  // 협력사와 관계없고 넘길 수도 없는 주문이면 패널을 그리지 않는다.
  if (!detail && !data.canSwitchToPartner) return null;

  async function run(operation: () => Promise<{ ok: boolean; error?: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error ?? ""] ?? result.error ?? "처리에 실패했습니다.");
        return;
      }
      setText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!assigned) {
    return (
      <section className="mx-6 mt-6 rounded-lg border border-zinc-200 bg-white p-4 lg:mx-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold text-zinc-900">외부 협력사(PL) 배정</p>
            <p className="mt-0.5 text-zinc-500">
              {data.partnerRouting === "PARTNER"
                ? "PL 배정 예정 (고객 입력이 끝나면 자동으로 넘어갑니다)"
                : data.hasPartnerServiceItem
                  ? "PL 용역 품목(조명·커튼·도어벨 등)이 든 건 — 고객 입력이 끝나면 PL 로 자동 배정됩니다."
                  : "자사 기사 배정 건입니다. PL 이 맡아야 하는 건이면 PL 로 넘길 수 있습니다."}
            </p>
          </div>
          {data.canSwitchToPartner && data.partnerRouting !== "PARTNER" ? (
            <button
              type="button"
              disabled={busy}
              className={getBackofficeButtonClass("secondary")}
              onClick={() =>
                run(
                  () => switchOrderToPartnerAction({ installationId }),
                  "이 주문을 PL 로 넘길까요? 진행 중인 자사 기사 배정 요청은 취소됩니다.",
                )
              }
            >
              PL 로 넘기기
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        {detail && detail.notes.length > 0 ? (
          <div className="mt-4">
            <PartnerNoteTimeline notes={detail.notes} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mx-6 mt-6 rounded-lg border border-violet-200 bg-violet-50/40 p-4 lg:mx-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-950">
          외부 협력사 배정 · {detail?.partnerName ?? "PL"}
        </h2>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
          {formatPartnerStatus(detail?.partnerStatus)}
        </span>
      </div>
      <p className="mb-3 text-sm text-zinc-700">
        PL 청구 금액{" "}
        <span className={detail?.claimAmount == null ? "font-semibold text-amber-700" : "font-semibold text-zinc-950"}>
          {formatClaimAmount(detail?.claimAmount)}
        </span>
        <span className="ml-2 text-xs text-zinc-500">(PL 입력값, 변경 이력은 아래 기록)</span>
      </p>

      <PartnerNoteTimeline notes={detail?.notes ?? []} />

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        placeholder={inReview ? "반려 사유 또는 승인 메모" : "PL 에 전달할 메모 / 전환 사유"}
        className="mt-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
      />
      {error ? <p className="mt-1 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {inReview ? (
          <>
            <button
              type="button"
              disabled={busy}
              className={getBackofficeButtonClass("primary")}
              onClick={() =>
                run(
                  () => reviewPartnerCompletionAction({ installationId, approve: true, reason: text }),
                  "완료 사진을 확인했고 승인할까요?",
                )
              }
            >
              검수 승인 (완료 처리)
            </button>
            <button
              type="button"
              disabled={busy}
              className={getBackofficeButtonClass("dangerSecondary")}
              onClick={() => run(() => reviewPartnerCompletionAction({ installationId, approve: false, reason: text }))}
            >
              반려 (PL 에 되돌리기)
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className={getBackofficeButtonClass("secondary")}
          onClick={() => run(() => addHqPartnerNoteAction({ installationId, body: text }))}
        >
          본사 메모 남기기
        </button>
        {data.canSwitchToInhouse ? (
          <button
            type="button"
            disabled={busy}
            className={getBackofficeButtonClass("dangerSecondary")}
            onClick={() =>
              run(
                () => switchOrderToInhouseAction({ installationId, reason: text }),
                "PL 배정을 취소하고 자사 기사 자동배정으로 돌릴까요? (입력한 내용이 사유로 남습니다)",
              )
            }
          >
            자사 기사 배정으로 전환
          </button>
        ) : null}
      </div>
    </section>
  );
}
