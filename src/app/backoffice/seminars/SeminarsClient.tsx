"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatKrPhone } from "@/lib/phone";
import type { SeminarState } from "@/lib/seminar/state";
import BackofficePageHeader from "../BackofficePageHeader";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import { cancelSeminarRegistrationAction, setSeminarManuallyClosedAction } from "./actions";
import {
  exportSeminarRegistrationsToExcel,
  seminarRegistrationStatusLabel,
  type SeminarRegistrationRow,
} from "./export";

type SeminarOption = { id: string; title: string; scheduleText: string };

type SeminarDetail = {
  id: string;
  title: string;
  scheduleText: string;
  venue: string;
  capacity: number;
  closesAt: string | null;
  manuallyClosed: boolean;
  state: SeminarState;
  publicUrl: string;
};

const STATE_LABEL: Record<SeminarState, { text: string; className: string }> = {
  OPEN: { text: "접수 중", className: "bg-emerald-50 text-emerald-700" },
  FULL: { text: "정원 마감", className: "bg-amber-50 text-amber-700" },
  CLOSED: { text: "접수 닫힘", className: "bg-zinc-100 text-zinc-600" },
};

export default function SeminarsClient({
  seminars,
  seminar,
  registrations,
}: {
  seminars: SeminarOption[];
  seminar: SeminarDetail;
  registrations: SeminarRegistrationRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const active = registrations.filter((row) => !row.cancelledAt);
  const cancelled = registrations.filter((row) => row.cancelledAt);
  const stateLabel = STATE_LABEL[seminar.state];

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      setError(res.error === "UNAUTHORIZED" ? "권한이 없습니다." : "처리에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    router.refresh();
  }

  function onToggleClosed() {
    const next = !seminar.manuallyClosed;
    if (!window.confirm(next ? "접수를 닫으시겠습니까?" : "접수를 다시 여시겠습니까?")) return;
    run(() => setSeminarManuallyClosedAction(seminar.id, next));
  }

  function onCancel(row: SeminarRegistrationRow) {
    if (!window.confirm(`${row.name} 기사의 신청을 취소하시겠습니까? 취소 안내 문자는 발송되지 않습니다.`)) return;
    run(() => cancelSeminarRegistrationAction(row.id));
  }

  async function onCopy() {
    await navigator.clipboard.writeText(seminar.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="p-6">
      <BackofficePageHeader
        title="세미나 신청 현황"
        meta={`신청 ${active.length}명 / 정원 ${seminar.capacity}명`}
        actions={
          <>
            {seminars.length > 1 ? (
              <select
                value={seminar.id}
                onChange={(e) => router.push(`/backoffice/seminars?id=${e.target.value}`)}
                className="h-9 rounded-md border border-zinc-300 px-2 text-sm"
              >
                {seminars.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title} · {option.scheduleText}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => exportSeminarRegistrationsToExcel(seminar.title, registrations)}
              disabled={registrations.length === 0}
              className={getBackofficeButtonClass("secondary", "md")}
            >
              엑셀 내려받기
            </button>
          </>
        }
      />

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-900">{seminar.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stateLabel.className}`}>
                {stateLabel.text}
              </span>
            </div>
            <dl className="mt-2 space-y-1 text-sm text-zinc-600">
              <div>일시 · {seminar.scheduleText}</div>
              <div>장소 · {seminar.venue}</div>
              <div>
                접수 마감 · {seminar.closesAt ?? "없음"}
                {seminar.manuallyClosed ? <span className="ml-1 text-zinc-900">(관리자가 닫음)</span> : null}
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={onToggleClosed}
            disabled={busy}
            className={getBackofficeButtonClass(seminar.manuallyClosed ? "primary" : "dangerSecondary", "md")}
          >
            {seminar.manuallyClosed ? "접수 다시 열기" : "접수 닫기"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">
          <span className="text-xs font-semibold text-zinc-600">신청 링크</span>
          <code className="min-w-0 flex-1 break-all text-xs text-zinc-700">{seminar.publicUrl}</code>
          <button type="button" onClick={onCopy} className={getBackofficeButtonClass("secondary", "sm")}>
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </section>

      <RegistrationTable
        title={`신청 ${active.length}명`}
        rows={active}
        empty="아직 신청한 기사가 없습니다."
        numbered
        action={(row) => (
          <button
            type="button"
            onClick={() => onCancel(row)}
            disabled={busy}
            className={getBackofficeButtonClass("dangerSecondary", "sm")}
          >
            취소
          </button>
        )}
      />

      {cancelled.length > 0 ? (
        <RegistrationTable title={`취소 ${cancelled.length}명`} rows={cancelled} empty="" />
      ) : null}
    </div>
  );
}

function RegistrationTable({
  title,
  rows,
  empty,
  numbered = false,
  action,
}: {
  title: string;
  rows: SeminarRegistrationRow[];
  empty: string;
  numbered?: boolean;
  action?: (row: SeminarRegistrationRow) => ReactNode;
}) {
  const th = "px-3 py-2 text-left text-xs font-semibold text-zinc-500";
  const td = "px-3 py-2 text-sm text-zinc-700";

  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white">
      <h3 className="border-b border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-zinc-50">
            <tr>
              {numbered ? <th className={th}>순번</th> : null}
              <th className={th}>이름</th>
              <th className={th}>전화번호</th>
              <th className={th}>소속</th>
              <th className={th}>지역</th>
              <th className={th}>신청 시각</th>
              {numbered ? null : <th className={th}>상태</th>}
              {numbered ? null : <th className={th}>취소 시각</th>}
              {action ? <th className={th} /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-zinc-100">
                {numbered ? <td className={`${td} tabular-nums text-zinc-500`}>{index + 1}</td> : null}
                <td className={`${td} font-medium text-zinc-900`}>{row.name}</td>
                <td className={`${td} tabular-nums`}>{formatKrPhone(row.phone)}</td>
                <td className={td}>{row.branch ?? "-"}</td>
                <td className={td}>{row.region ?? "-"}</td>
                <td className={`${td} tabular-nums`}>{row.registeredAt}</td>
                {numbered ? null : <td className={td}>{seminarRegistrationStatusLabel(row)}</td>}
                {numbered ? null : <td className={`${td} tabular-nums`}>{row.cancelledAt}</td>}
                {action ? <td className={`${td} text-right`}>{action(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && empty ? (
          <div className="px-3 py-8 text-center text-sm text-zinc-500">{empty}</div>
        ) : null}
      </div>
    </section>
  );
}
