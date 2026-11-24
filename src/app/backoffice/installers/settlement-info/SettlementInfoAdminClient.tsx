"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import type { SettlementInfoAdminRow } from "@/lib/installer/settlement-info-admin";
import {
  INFO_DOC_TYPE_LABEL,
  INFO_DOC_TYPE_ORDER,
  formatBusinessNumber,
  type TaxDocType,
} from "@/lib/installer/settlement-info-shared";
import { approveSettlementInfoAction, remindSettlementInfoAction, setTaxDocTypeAction } from "./actions";

type InfoKey = SettlementInfoAdminRow["infoStatus"];
type TypeKey = TaxDocType | "NONE";
type LinkKey = "NONE" | "NOT_MEMBER" | "NO_CERT" | "READY" | "EXPIRING";

const INFO_LABEL: Record<InfoKey, { text: string; cls: string }> = {
  NONE: { text: "미등록", cls: "bg-zinc-100 text-zinc-600" },
  SUBMITTED: { text: "확인 중", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { text: "승인", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { text: "반려", cls: "bg-red-100 text-red-700" },
};
const LINK_LABEL: Record<LinkKey, { text: string; cls: string }> = {
  NONE: { text: "미가입", cls: "bg-zinc-100 text-zinc-600" },
  NOT_MEMBER: { text: "미가입", cls: "bg-zinc-100 text-zinc-600" },
  NO_CERT: { text: "인증서 미등록", cls: "bg-amber-100 text-amber-800" },
  READY: { text: "연동 완료", cls: "bg-emerald-100 text-emerald-800" },
  EXPIRING: { text: "인증서 30일 내 만료", cls: "bg-red-100 text-red-700" },
};
const ERR: Record<string, string> = {
  TAX_DOC_TYPE_INVALID: "증빙 종류가 올바르지 않습니다.",
  NOT_FOUND: "정산 정보가 없는 기사입니다.",
  UNAUTHORIZED: "다시 로그인해 주세요.",
};

const DAY_MS = 24 * 3600 * 1000;

function linkKey(r: SettlementInfoAdminRow, now: number): LinkKey {
  const p = r.popbill;
  if (!p || p.status === "NOT_MEMBER") return "NONE";
  if (p.status === "READY") {
    if (p.certExpiresAt && Date.parse(p.certExpiresAt) - now < 30 * DAY_MS) return "EXPIRING";
    return "READY";
  }
  return "NO_CERT";
}

const typeKey = (r: SettlementInfoAdminRow): TypeKey => r.taxDocType ?? "NONE";
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }) : "-";
const typeText = (v: string | null) => (v ? (INFO_DOC_TYPE_LABEL[v as TaxDocType] ?? v) : "미선택");

export default function SettlementInfoAdminClient({
  rows,
  canEdit,
}: {
  rows: SettlementInfoAdminRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());
  const [infoF, setInfoF] = useState<InfoKey | "ALL">("ALL");
  const [typeF, setTypeF] = useState<TypeKey | "ALL">("ALL");
  const [linkF, setLinkF] = useState<LinkKey | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = useMemo(() => {
    const info: Record<InfoKey, number> = { NONE: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 };
    const type: Record<TypeKey, number> = { NONE: 0, E_TAX_INVOICE: 0, PAPER_TAX_INVOICE: 0, CASH_RECEIPT: 0 };
    const link: Record<LinkKey, number> = { NONE: 0, NOT_MEMBER: 0, NO_CERT: 0, READY: 0, EXPIRING: 0 };
    for (const r of rows) {
      info[r.infoStatus] += 1;
      if (r.infoStatus !== "NONE") type[typeKey(r)] += 1;
      link[linkKey(r, now)] += 1;
    }
    return { info, type, link };
  }, [rows, now]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (infoF === "ALL" || r.infoStatus === infoF) &&
        (typeF === "ALL" || (r.infoStatus !== "NONE" && typeKey(r) === typeF)) &&
        (linkF === "ALL" || linkKey(r, now) === linkF) &&
        (!term ||
          r.name.toLowerCase().includes(term) ||
          (r.branch ?? "").toLowerCase().includes(term) ||
          (r.businessName ?? "").toLowerCase().includes(term) ||
          (r.businessNumber ?? "").includes(term.replace(/\D/g, "") || "\u0000")),
    );
  }, [rows, infoF, typeF, linkF, q, now]);

  // 알림 대상: 지금 보이는 기사 중 미등록이거나 증빙 종류 미선택
  const remindTargets = filtered.filter((r) => r.infoStatus === "NONE" || !r.taxDocType);

  function run(fn: () => Promise<{ ok: boolean; error?: string; sent?: number; skipped?: number }>, okText?: (r: { sent?: number; skipped?: number }) => string) {
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setMessage({ ok: false, text: ERR[r.error ?? ""] ?? r.error ?? "실패했습니다." });
      else {
        if (okText) setMessage({ ok: true, text: okText(r) });
        router.refresh();
      }
    });
  }

  function onTypeChange(r: SettlementInfoAdminRow, next: string) {
    const toCash = next === "CASH_RECEIPT";
    const ok = confirm(
      `${r.name} 기사의 증빙 종류를 「${typeText(r.taxDocType)}」 → 「${typeText(next)}」로 바꿀까요?\n` +
        "이미 증빙을 냈거나 지급된 정산서에는 영향이 없고, 아직 진행 전인 정산서부터 적용됩니다." +
        (toCash ? "\n\n※ 현금영수증 거래 방식은 2026년 12월 1일 설치 건부터 중단됩니다." : ""),
    );
    if (ok) run(() => setTaxDocTypeAction(r.installerId, next));
  }

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-left text-sm ${active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:border-zinc-400"}`;

  return (
    <div className="mx-auto max-w-6xl">
      <BackofficePageHeader
        title="기사 정산 정보 관리"
        meta={`활동 기사 ${rows.length}명`}
        actions={
          canEdit ? (
            <button
              className={getBackofficeButtonClass("secondary", "sm")}
              disabled={pending || remindTargets.length === 0}
              onClick={() => {
                if (
                  confirm(
                    `지금 목록에서 정산 정보 미등록·증빙 종류 미선택인 기사 ${remindTargets.length}명에게 앱 알림을 보낼까요?`,
                  )
                )
                  run(
                    () => remindSettlementInfoAction(remindTargets.map((r) => r.installerId)),
                    (r) => `알림 ${r.sent ?? 0}명 발송${r.skipped ? ` · ${r.skipped}명은 앱 미설치 등으로 못 보냄` : ""}`,
                  );
              }}
            >
              미등록·미선택 {remindTargets.length}명에게 알림
            </button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Group title="정산 정보">
          {(["NONE", "SUBMITTED", "APPROVED", "REJECTED"] as InfoKey[]).map((k) => (
            <button key={k} className={chip(infoF === k)} onClick={() => setInfoF(infoF === k ? "ALL" : k)}>
              <div className="text-xs opacity-70">{INFO_LABEL[k].text}</div>
              <div className="text-lg font-bold">{counts.info[k]}</div>
            </button>
          ))}
        </Group>
        <Group title="증빙 종류 (정산 정보 있는 기사)">
          {(["NONE", ...INFO_DOC_TYPE_ORDER] as TypeKey[]).map((k) => (
            <button key={k} className={chip(typeF === k)} onClick={() => setTypeF(typeF === k ? "ALL" : k)}>
              <div className="text-xs opacity-70">{k === "NONE" ? "미선택" : INFO_DOC_TYPE_LABEL[k]}</div>
              <div className="text-lg font-bold">{counts.type[k]}</div>
            </button>
          ))}
        </Group>
        <Group title="팝빌 연동">
          {(["NONE", "NO_CERT", "READY", "EXPIRING"] as LinkKey[]).map((k) => (
            <button key={k} className={chip(linkF === k)} onClick={() => setLinkF(linkF === k ? "ALL" : k)}>
              <div className="text-xs opacity-70">{LINK_LABEL[k].text}</div>
              <div className="text-lg font-bold">{counts.link[k]}</div>
            </button>
          ))}
        </Group>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="w-72 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="이름·지점·상호·사업자번호 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {infoF !== "ALL" || typeF !== "ALL" || linkF !== "ALL" || q ? (
          <button
            className="text-sm text-zinc-500 underline"
            onClick={() => {
              setInfoF("ALL");
              setTypeF("ALL");
              setLinkF("ALL");
              setQ("");
            }}
          >
            필터 초기화
          </button>
        ) : null}
        <span className="ml-auto text-sm text-zinc-500">{filtered.length}명</span>
      </div>

      {message ? (
        <div className={`mb-3 rounded-lg px-4 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-zinc-500">
              <th className="px-3 py-2">기사</th>
              <th className="px-3">지점·지역</th>
              <th className="px-3">정산 정보</th>
              <th className="px-3">증빙 종류</th>
              <th className="px-3">사업자번호·상호</th>
              <th className="px-3">팝빌 연동</th>
              <th className="px-3">제출일</th>
              <th className="px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const info = INFO_LABEL[r.infoStatus];
              const lk = LINK_LABEL[linkKey(r, now)];
              return (
                <tr key={r.installerId} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{[r.branch, r.region].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${info.cls}`}>{info.text}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.infoStatus === "NONE" ? (
                      <span className="text-zinc-400">-</span>
                    ) : (
                      <>
                        <select
                          className={`rounded-md border px-2 py-1 text-sm ${r.taxDocType ? "border-zinc-300" : "border-amber-400 bg-amber-50"}`}
                          value={r.taxDocType ?? ""}
                          disabled={!canEdit || pending}
                          onChange={(e) => onTypeChange(r, e.target.value)}
                        >
                          {!r.taxDocType ? <option value="">미선택</option> : null}
                          {INFO_DOC_TYPE_ORDER.map((t) => (
                            <option key={t} value={t}>
                              {INFO_DOC_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                        {r.lastChange ? (
                          <div className="mt-1 text-xs text-zinc-400">
                            {fmtDate(r.lastChange.at)} {r.lastChange.by} · {typeText(r.lastChange.from)} → {typeText(r.lastChange.to)}
                          </div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.businessNumber ? (
                      <>
                        <div>{formatBusinessNumber(r.businessNumber)}</div>
                        <div className="text-xs text-zinc-500">{r.businessName}</div>
                      </>
                    ) : (
                      <span className="text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${lk.cls}`}>{lk.text}</span>
                    {r.popbill?.certExpiresAt && r.popbill.status === "READY" ? (
                      <div className="mt-1 text-xs text-zinc-400">만료 {fmtDate(r.popbill.certExpiresAt)}</div>
                    ) : null}
                    {r.popbill?.stale ? <div className="mt-1 text-xs text-red-600">사업자번호 변경됨 · 재확인 필요</div> : null}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{fmtDate(r.submittedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {canEdit && r.infoStatus === "SUBMITTED" ? (
                      <button
                        className="mr-3 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-40"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`${r.name} 기사의 정산 정보를 승인할까요? (사진은 상세에서 확인할 수 있습니다)`))
                            run(() => approveSettlementInfoAction(r.installerId));
                        }}
                      >
                        승인
                      </button>
                    ) : null}
                    <Link className="text-xs font-semibold text-blue-700 hover:underline" href={`/backoffice/installers/${r.installerId}`}>
                      상세 ›
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-400">
                  조건에 맞는 기사가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        증빙 종류: 「전자세금계산서(팝빌)」은 앱에서 팝빌로 발행, 「세금계산서」는 홈택스·종이로 직접 발행 후 사진 제출(팝빌 연동돼 있으면
        앱 발행도 가능), 「현금영수증」은 지급 후 승인번호 등록. 기사가 팝빌 연동을 마치면 「세금계산서」가 자동으로 「전자세금계산서(팝빌)」로
        바뀝니다. 바꾼 증빙 종류는 아직 증빙 제출·지급 전인 정산서부터 적용됩니다.
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 text-xs font-bold text-zinc-600">{title}</div>
      <div className="grid grid-cols-4 gap-2">{children}</div>
    </div>
  );
}
