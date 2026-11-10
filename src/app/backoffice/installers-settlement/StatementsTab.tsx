"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MonthPreviewRow, StatementView } from "@/lib/installation/settlement/statements";
import { TAX_DOC_TYPE_LABEL } from "@/lib/installer/settlement-info-shared";
import {
  cancelStatementAction,
  issueMonthStatementsAction,
  markPaidAction,
  reviewEvidenceAction,
} from "./actions";
import { TabLink } from "./SettlementClient";

const won = (n: number) => `${n.toLocaleString()}원`;
const fmtYm = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
const shift = (ym: string, d: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

const ERR: Record<string, string> = {
  NOT_LAUNCHED: "정산 기능 공개 전이라 발행할 수 없습니다.",
  MONTH_NOT_CLOSED: "이번 달은 아직 마감 전이라 발행할 수 없습니다.",
  ALREADY_ISSUED: "선택한 기사는 이미 이 달 정산서가 발행됐습니다.",
  NOTHING_SELECTED: "발행할 기사를 선택해 주세요.",
  NOTHING_TO_ISSUE: "발행할 정산 내역이 없습니다.",
  ALREADY_IN_PROGRESS: "증빙 제출 또는 지급이 시작돼 발행을 취소할 수 없습니다.",
  REJECT_REASON_REQUIRED: "반려 사유를 입력해 주세요.",
  SOME_NOT_PAYABLE: "지급 조건이 안 되는 건이 섞여 있습니다. 새로고침 후 다시 선택해 주세요.",
};

/** 정산서 하나의 진행 단계(화면 표시용) */
function stage(s: StatementView): { text: string; cls: string } {
  if (!s.flow) return { text: "증빙 종류 미선택", cls: "bg-zinc-100 text-zinc-600" };
  if (s.flow === "TAX") {
    if (s.paidAt) return { text: "지급 완료", cls: "bg-emerald-100 text-emerald-800" };
    if (s.evidenceStatus === "CONFIRMED") return { text: "지급 대기", cls: "bg-blue-100 text-blue-800" };
    if (s.evidenceStatus === "SUBMITTED") return { text: "계산서 확인 필요", cls: "bg-amber-100 text-amber-800" };
    if (s.evidenceStatus === "REJECTED") return { text: "계산서 반려", cls: "bg-red-100 text-red-700" };
    return { text: "계산서 대기", cls: "bg-zinc-100 text-zinc-600" };
  }
  if (!s.paidAt) return { text: "지급 대기", cls: "bg-blue-100 text-blue-800" };
  if (s.evidenceStatus === "CONFIRMED") return { text: "완료", cls: "bg-emerald-100 text-emerald-800" };
  if (s.evidenceStatus === "SUBMITTED") return { text: "영수증 확인 필요", cls: "bg-amber-100 text-amber-800" };
  if (s.evidenceStatus === "REJECTED") return { text: "영수증 반려 · 앱 제한", cls: "bg-red-100 text-red-700" };
  return { text: "영수증 대기 · 앱 제한", cls: "bg-red-100 text-red-700" };
}

/** payBlockReason 과 같은 규칙(서버가 다시 확인한다) */
function payable(s: StatementView): boolean {
  if (s.paidAt || s.infoStatus !== "APPROVED" || !s.flow) return false;
  return s.flow === "CASH" || s.evidenceStatus === "CONFIRMED";
}

export default function StatementsTab({
  ym,
  thisYm,
  statements,
  preview,
  launched,
}: {
  launched: boolean;
  ym: string;
  thisYm: string;
  statements: StatementView[];
  preview: MonthPreviewRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  // 발행할 기사 선택. 기본은 전체 선택.
  const [toIssue, setToIssue] = useState<Set<string>>(() => new Set(preview.map((p) => p.installerId)));
  const issued = statements.length > 0;
  const issueIds = preview.map((p) => p.installerId).filter((id) => toIssue.has(id));
  const issueSum = preview.filter((p) => toIssue.has(p.installerId)).reduce((a, p) => a + p.baseAmount, 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(ERR[res.error ?? ""] ?? res.error ?? "실패");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const totals = useMemo(() => {
    const t = { base: 0, pay: 0, paid: 0, needReview: 0, payableCount: 0 };
    for (const s of statements) {
      t.base += s.baseAmount;
      t.pay += s.payAmount;
      if (s.paidAt) t.paid += s.payAmount;
      if (s.evidenceStatus === "SUBMITTED") t.needReview += 1;
      if (payable(s)) t.payableCount += 1;
    }
    return t;
  }, [statements]);

  const payableIds = statements.filter(payable).map((s) => s.id);
  const selectedPayable = [...selected].filter((id) => payableIds.includes(id));
  const go = (target: string) => router.push(`/backoffice/installers-settlement?tab=statements&ym=${target}`);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-950">기사 정산</h1>
        <nav className="flex gap-2">
          <TabLink label="정산" active={false} href="/backoffice/installers-settlement?tab=settlement" />
          <TabLink label="월 정산서" active href="/backoffice/installers-settlement?tab=statements" />
          <TabLink label="요율 설정" active={false} href="/backoffice/installers-settlement?tab=rates" />
        </nav>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <button className={navBtn} onClick={() => go(shift(ym, -1))} aria-label="이전 달">
            ‹
          </button>
          <span className="min-w-[8rem] text-center text-lg font-bold">{fmtYm(ym)}</span>
          <button
            className={navBtn}
            onClick={() => go(shift(ym, 1))}
            disabled={shift(ym, 1) > thisYm}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
        {issued ? (
          <div className="flex flex-wrap gap-2">
            <a className={secondaryBtn} href={`/api/settlement/statements/export?ym=${ym}`}>
              이체용 엑셀 ({totals.payableCount}건)
            </a>
          </div>
        ) : null}
      </section>

      <p className="text-xs text-zinc-500">
        일정: 말일 마감 → 다음 달 5일까지 정산서 발행 → 10일까지 기사 세금계산서 → 15일 지급. 세금계산서 건은 정산 금액 + 부가세
        10%를 지급하고, 현금영수증 건은 정산 금액을 먼저 지급한 뒤 영수증을 받습니다.
      </p>

      {!launched ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          아직 공개 전입니다. 기사 앱에는 정산 기능이 보이지 않고, 정산서를 발행할 수 없습니다. 공개하려면 시스템 설정에서{" "}
          <code>installer.settlement.launched</code> 를 <code>true</code> 로 바꾸세요.
        </div>
      ) : null}

      {error ? <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

      {preview.length > 0 || !issued ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-700">
                {issued ? `아직 발행하지 않은 기사 (${preview.length})` : "발행 전 미리보기"}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {fmtYm(ym)} 말일까지 완료·승인됐고 아직 정산서에 들어가지 않은 건입니다(이전 달에 늦게 승인된 건 포함).
                발행할 기사를 고르세요. 발행하면 그 기사의 금액이 잠기고 기사 앱에 정산서가 전달됩니다. 고르지 않은 기사는 나중에
                발행할 수 있습니다.
              </p>
            </div>
            <button
              className={primaryBtn}
              disabled={!launched || pending || issueIds.length === 0 || ym >= thisYm}
              onClick={() => {
                if (confirm(`${fmtYm(ym)} 정산서를 선택한 ${issueIds.length}명에게 발행할까요? (합계 ${won(issueSum)})`))
                  run(() => issueMonthStatementsAction(ym, issueIds));
              }}
            >
              {ym >= thisYm ? "마감 전" : `선택한 ${issueIds.length}명 정산서 발행`}
            </button>
          </div>
          {preview.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">발행할 정산 내역이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500">
                  <th className="w-8 py-2">
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={preview.length > 0 && preview.every((p) => toIssue.has(p.installerId))}
                      onChange={(e) => setToIssue(e.target.checked ? new Set(preview.map((p) => p.installerId)) : new Set())}
                    />
                  </th>
                  <th>기사</th>
                  <th className="text-right">건수</th>
                  <th className="text-right">정산 금액</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.installerId} className="border-b last:border-0">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        aria-label={`${p.installerName} 선택`}
                        checked={toIssue.has(p.installerId)}
                        onChange={(e) =>
                          setToIssue((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.installerId);
                            else next.delete(p.installerId);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="font-medium">{p.installerName}</td>
                    <td className="text-right">{p.lineCount}건</td>
                    <td className="text-right font-semibold">{won(p.baseAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {issued ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="정산 금액 합계" value={won(totals.base)} />
            <Stat label="지급액 합계 (부가세 포함)" value={won(totals.pay)} strong />
            <Stat label="지급 완료" value={won(totals.paid)} />
            <Stat label="확인 필요" value={`${totals.needReview}건`} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-zinc-700">기사별 정산서 ({statements.length})</h2>
              <button
                className={primaryBtn}
                disabled={pending || selectedPayable.length === 0}
                onClick={() => {
                  if (confirm(`선택한 ${selectedPayable.length}건을 지급 완료로 처리할까요? (실제 이체를 마친 뒤에 누르세요)`))
                    run(() => markPaidAction(selectedPayable), () => setSelected(new Set()));
                }}
              >
                지급 완료 처리 ({selectedPayable.length})
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-zinc-500">
                    <th className="w-8 py-2">
                      <input
                        type="checkbox"
                        aria-label="지급 가능 전체 선택"
                        checked={payableIds.length > 0 && payableIds.every((id) => selected.has(id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(payableIds) : new Set())}
                      />
                    </th>
                    <th>기사</th>
                    <th>증빙</th>
                    <th className="text-right">건수</th>
                    <th className="text-right">정산 금액</th>
                    <th className="text-right">부가세</th>
                    <th className="text-right">지급액</th>
                    <th>상태</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => {
                    const st = stage(s);
                    const canPay = payable(s);
                    return (
                      <FragmentRow
                        key={s.id}
                        s={s}
                        st={st}
                        canPay={canPay}
                        checked={selected.has(s.id)}
                        onCheck={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          })
                        }
                        open={open === s.id}
                        onToggle={() => setOpen(open === s.id ? null : s.id)}
                        pending={pending}
                        onReview={(approve, reason) =>
                          run(() => reviewEvidenceAction({ statementId: s.id, approve, rejectReason: reason }))
                        }
                        onCancel={() => {
                          if (
                            confirm(
                              `${s.installerName} 기사의 ${fmtYm(ym)} 정산서 발행을 취소할까요? 이 기사의 건은 다시 미발행으로 돌아갑니다.`,
                            )
                          )
                            run(() => cancelStatementAction(s.id));
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function FragmentRow({
  s,
  st,
  canPay,
  checked,
  onCheck,
  open,
  onToggle,
  pending,
  onReview,
  onCancel,
}: {
  s: StatementView;
  st: { text: string; cls: string };
  canPay: boolean;
  checked: boolean;
  onCheck: (v: boolean) => void;
  open: boolean;
  onToggle: () => void;
  pending: boolean;
  onReview: (approve: boolean, reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const infoWarning = s.infoStatus === null ? "정산 정보 미등록" : s.infoStatus !== "APPROVED" ? "정산 정보 미승인" : null;
  return (
    <>
      <tr className="border-b">
        <td className="py-2.5">
          <input type="checkbox" disabled={!canPay} checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        </td>
        <td className="font-medium">
          <Link className="hover:underline" href={`/backoffice/installers/${s.installerId}`}>
            {s.installerName}
          </Link>
          {infoWarning ? <div className="text-xs font-semibold text-red-600">{infoWarning}</div> : null}
        </td>
        <td className="text-zinc-700">{s.taxDocType ? TAX_DOC_TYPE_LABEL[s.taxDocType] : "-"}</td>
        <td className="text-right">{s.lineCount}</td>
        <td className="text-right">{won(s.baseAmount)}</td>
        <td className="text-right text-zinc-500">{s.vatAmount ? won(s.vatAmount) : "-"}</td>
        <td className="text-right font-bold">{won(s.payAmount)}</td>
        <td>
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.text}</span>
        </td>
        <td className="text-right">
          <button className="text-xs font-semibold text-blue-600 hover:underline" onClick={onToggle}>
            {open ? "닫기" : s.evidenceStatus === "SUBMITTED" ? "확인하기" : "상세"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-b bg-zinc-50">
          <td colSpan={9} className="space-y-3 px-3 py-3 text-sm">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
              <div>
                <span className="text-zinc-500">계좌</span> {s.bankName ?? "-"} {s.accountNumber ?? ""} ({s.accountHolder ?? "-"})
              </div>
              {s.flow === "TAX" ? (
                <div>
                  <span className="text-zinc-500">계산서 작성일</span> {s.invoiceIssueDate ?? "-"}
                </div>
              ) : (
                <div>
                  <span className="text-zinc-500">현금영수증</span> {s.cashReceiptNo ?? "-"} · {s.cashReceiptDate ?? "-"}
                </div>
              )}
              <div>
                <span className="text-zinc-500">지급</span>{" "}
                {s.paidAt ? new Date(s.paidAt).toLocaleDateString("ko-KR") : "-"}
              </div>
            </div>
            {s.evidenceRejectReason ? <p className="text-red-600">반려 사유: {s.evidenceRejectReason}</p> : null}
            {s.evidencePhotoUrls.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {s.evidencePhotoUrls.map((url, i) =>
                  url ? (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="증빙" className="h-40 rounded border border-zinc-200 bg-white object-contain" />
                    </a>
                  ) : (
                    <div key={i} className="flex h-40 w-32 items-center justify-center rounded border border-dashed text-xs text-zinc-400">
                      불러오기 실패
                    </div>
                  ),
                )}
              </div>
            ) : null}
            {!s.paidAt && s.evidenceStatus === "PENDING" ? (
              <div>
                <button className="text-xs font-semibold text-red-600 hover:underline" disabled={pending} onClick={onCancel}>
                  이 기사 발행 취소
                </button>
                <span className="ml-2 text-xs text-zinc-400">증빙 제출·지급 전에만 됩니다</span>
              </div>
            ) : null}
            {s.evidenceStatus === "SUBMITTED" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">
                  {s.flow === "TAX"
                    ? "홈택스 매입 내역 또는 원본으로 금액(공급가액·세액)을 확인하세요."
                    : "홈택스에서 승인번호·금액을 확인하세요."}
                </span>
                <button className={primaryBtn} disabled={pending} onClick={() => onReview(true)}>
                  확인
                </button>
                <input
                  className="min-w-[14rem] flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                  placeholder="반려 사유 (기사 앱에 보입니다)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button className={secondaryBtn} disabled={pending} onClick={() => onReview(false, reason)}>
                  반려
                </button>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${strong ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white"}`}>
      <div className={`text-xs ${strong ? "text-zinc-300" : "text-zinc-500"}`}>{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

const navBtn = "h-9 w-9 rounded-md border border-zinc-300 text-lg disabled:opacity-30";
const primaryBtn = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";
