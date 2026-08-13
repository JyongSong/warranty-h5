"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AsAdminDetail, AsInstallerRecommendation } from "@/lib/installation/as/service";
import {
  approveAsCompletionAction,
  assignAsOrderAction,
  cancelAsOrderAction,
  lookupOriginalInstallerAction,
  recommendAsInstallersAction,
  rejectAsCompletionAction,
} from "../actions";

const STATUS_LABEL: Record<string, string> = {
  WAITING_ASSIGNMENT: "배정 대기",
  WAITING_INSTALLER_RESPONSE: "기사 응답 대기",
  INSTALLER_ASSIGNED: "처리 중",
  WAITING_HQ_REVIEW: "검수 대기",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const btn = "h-9 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:bg-zinc-400";
const btnSec = "h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700";
const btnDanger = "h-9 rounded-md border border-red-500 bg-white px-3 text-sm font-semibold text-red-600";

export default function AsAdminDetailClient({ detail }: { detail: AsAdminDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AsInstallerRecommendation[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function findOriginal() {
    setBusy(true);
    setError(null);
    const res = await lookupOriginalInstallerAction({
      orderNo: detail.orderNo ?? "",
      phone: detail.customerPhone ?? "",
    });
    setBusy(false);
    if (res.ok && res.result) {
      const installerId = res.result.installerId;
      await run(() => assignAsOrderAction(detail.id, installerId));
    } else if (res.ok) {
      setError("원 설치 이력을 찾지 못했습니다. 주소로 추천하세요.");
    } else {
      setError(res.error);
    }
  }

  async function recommend() {
    setBusy(true);
    setError(null);
    const res = await recommendAsInstallersAction(detail.address ?? "");
    setBusy(false);
    if (res.ok) setCandidates(res.recommendations);
    else setError(res.error);
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <button className="mb-2 text-sm font-semibold text-zinc-500" onClick={() => router.push("/backoffice/as/search")}>
        ← 목록으로
      </button>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">A/S 상세</h1>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700">
          {STATUS_LABEL[detail.status] ?? detail.status}
        </span>
      </div>

      <div className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
        <Row label="증상" value={`${detail.symptomCode} · ${detail.symptomLabel}`} />
        {detail.symptomDetail ? <Row label="상세" value={detail.symptomDetail} /> : null}
        <Row label="고객" value={detail.customerName ?? "-"} />
        <Row label="연락처" value={detail.customerPhone ?? "-"} />
        <Row label="주소" value={detail.address ?? "-"} />
        <Row label="주문번호" value={detail.orderNo ?? "-"} />
        {detail.memo ? <Row label="메모" value={detail.memo} /> : null}
        <Row label="담당 기사" value={detail.installerName ?? "미지정"} />
        {detail.installerRejectReason ? (
          <Row label="기사 거절 사유" value={detail.installerRejectReason} />
        ) : null}
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      {/* Assign panel */}
      {detail.status === "WAITING_ASSIGNMENT" ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-sm font-semibold text-zinc-700">기사 지정</div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button className={btnSec} disabled={busy} onClick={findOriginal}>
              원 설치기사 배정
            </button>
            <button className={btnSec} disabled={busy} onClick={recommend}>
              주소로 기사 추천
            </button>
          </div>
          {candidates.length > 0 ? (
            <div className="grid gap-1">
              {candidates.map((c) => (
                <button
                  key={c.installerId}
                  disabled={busy}
                  onClick={() => run(() => assignAsOrderAction(detail.id, c.installerId))}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-zinc-400"
                >
                  <span>
                    {c.name} <span className="text-zinc-400">· {c.region ?? "-"}</span>
                  </span>
                  <span className="text-xs text-zinc-400">{c.matchTier ?? ""}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Review panel */}
      {detail.status === "WAITING_HQ_REVIEW" ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-zinc-700">완료 검수</div>
          <Row label="처리 내용" value={detail.resolutionDetail ?? "-"} />
          <Row label="용역비" value={detail.serviceFee != null ? `${detail.serviceFee.toLocaleString()}원` : "-"} />
          {detail.photoUrls.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.photoUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`photo-${i + 1}`} className="h-24 w-24 rounded-md border border-zinc-200 object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-400">첨부 사진 없음</div>
          )}

          {!rejectOpen ? (
            <div className="mt-3 flex gap-2">
              <button className={btn} disabled={busy} onClick={() => run(() => approveAsCompletionAction(detail.id))}>
                승인 (완료 처리)
              </button>
              <button className={btnDanger} disabled={busy} onClick={() => setRejectOpen(true)}>
                반려
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <textarea
                className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="반려 사유 (기사에게 전달됩니다)"
              />
              <div className="mt-2 flex gap-2">
                <button
                  className={btnDanger}
                  disabled={busy}
                  onClick={() => run(() => rejectAsCompletionAction(detail.id, reason))}
                >
                  반려 확정
                </button>
                <button className={btnSec} disabled={busy} onClick={() => setRejectOpen(false)}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Completed read-only */}
      {detail.status === "COMPLETED" ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-zinc-700">처리 결과</div>
          <Row label="처리 내용" value={detail.resolutionDetail ?? "-"} />
          <Row label="용역비" value={detail.serviceFee != null ? `${detail.serviceFee.toLocaleString()}원` : "-"} />
          {detail.photoUrls.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.photoUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`photo-${i + 1}`} className="h-24 w-24 rounded-md border border-zinc-200 object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {detail.status !== "COMPLETED" && detail.status !== "CANCELLED" ? (
        <div className="mt-4">
          <button
            className={btnSec}
            disabled={busy}
            onClick={() => {
              const r = window.prompt("취소 사유를 입력하세요");
              if (r && r.trim()) run(() => cancelAsOrderAction(detail.id, r.trim()));
            }}
          >
            A/S 취소
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-1">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="text-zinc-900">{value}</div>
    </div>
  );
}
