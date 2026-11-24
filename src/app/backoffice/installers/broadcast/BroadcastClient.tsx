"use client";

import { useMemo, useState, useTransition } from "react";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import type { BroadcastMode, BroadcastRecipient, BroadcastResult, BroadcastScope } from "@/lib/installer/broadcast";
import { listBroadcastRecipientsAction, sendBroadcastAction } from "./actions";

type Limits = {
  pushTitle: number;
  pushBody: number;
  smsSubject: number;
  smsBody: number;
  noticeTitle: number;
  noticeBody: number;
  recipients: number;
};

const MODE_LABEL: Record<BroadcastMode, string> = {
  BOTH: "앱 푸시 + 문자 모두",
  PUSH_ELSE_SMS: "앱 설치 기사는 푸시, 미설치 기사는 문자",
  PUSH_ONLY: "앱 푸시만",
  SMS_ONLY: "문자(LMS)만",
};

const ERR: Record<string, string> = {
  PUSH_REQUIRED: "푸시 제목과 내용을 입력해 주세요.",
  SMS_REQUIRED: "문자 내용을 입력해 주세요.",
  PUSH_TOO_LONG: "푸시 제목·내용이 너무 깁니다.",
  SMS_TOO_LONG: "문자 내용이 너무 깁니다.",
  NOTICE_REQUIRED: "앱 공지 팝업 제목과 내용을 입력해 주세요.",
  NOTICE_TOO_LONG: "앱 공지 팝업 내용이 너무 깁니다.",
  NO_RECIPIENTS: "보낼 기사를 선택해 주세요.",
  TOO_MANY_RECIPIENTS: "한 번에 보낼 수 있는 인원을 넘었습니다.",
  UNAUTHORIZED: "다시 로그인해 주세요.",
};

type Template = {
  label: string;
  pushTitle: string;
  pushBody: string;
  smsSubject: string;
  smsBody: string;
  noticeTitle: string;
  noticeBody: string;
};

/** 2026-11 정산 안내(대상: 10·11월 작업 기사) */
const SETTLEMENT_TEMPLATE: Template = {
  label: "정산 안내(12월 5일)",
  pushTitle: "설치비 정산 안내 (12월 5일까지)",
  pushBody:
    "「내 정보 → 정산 정보 등록」에서 사업자·계좌·증빙 종류를 등록하고, 「이력·정산」의 정산서로 12월 5일까지 세금계산서를 발행해 주세요. 정산금은 12월 중 지급됩니다.",
  smsSubject: "설치비 정산 안내",
  smsBody: `[아카라라이프] 설치비 정산 안내

■ 1. 정산 정보 등록
앱 「내 정보 → 정산 정보 등록」에서 사업자·계좌 정보와 증빙 종류(세금계산서/현금영수증)를 등록해 주세요. 등록하셔야 정산금이 지급됩니다.

■ 2. 세금계산서 발행 기한
앱 「이력·정산」에서 정산서를 확인하시고 12월 5일까지 세금계산서를 발행해 주세요. 정산금은 12월 중 지급됩니다. (5일 이후 제출 시 다음 달 중 지급)
앱 설치가 어려운 분(아이폰 등)은 아래 주소로 접속해 같은 기능을 이용하실 수 있습니다.
https://www.aqaralife-service.kr/installer

■ 3. 앞으로의 정산 일정
매월 1일 전월분 정산서 발행 → 5일까지 세금계산서 발행 → 그 달 중 지급

■ 4. 현금영수증 중단 안내
현금영수증 거래 방식은 12월 1일 설치 건부터 중단 예정입니다. 12월 1일 이후 설치 건은 세금계산서로만 정산 가능합니다.

■ 5. 앱 설치
기사 앱을 아직 설치하지 않으신 분은 아래 링크에서 설치해 주세요.
https://www.aqaralife-service.kr/installer-start.html`,
  noticeTitle: "설치비 정산 안내 (12월 5일까지)",
  noticeBody: `■ 1. 정산 정보 등록
「내 정보 → 정산 정보 등록」에서 사업자·계좌 정보와 증빙 종류(세금계산서/현금영수증)를 등록해 주세요. 등록하셔야 정산금이 지급됩니다.

■ 2. 세금계산서 발행 기한
「이력·정산」에서 정산서를 확인하시고 12월 5일까지 세금계산서를 발행해 주세요. 정산금은 12월 중 지급됩니다. (5일 이후 제출 시 다음 달 중 지급)
세금계산서 기사님은 「내 정보 → 전자세금계산서 연동」을 해 두시면 앱에서 버튼 하나로 발행할 수 있습니다.

■ 3. 앞으로의 정산 일정
매월 1일 전월분 정산서 발행 → 5일까지 세금계산서 발행 → 그 달 중 지급

■ 4. 현금영수증 중단 안내
현금영수증 거래 방식은 12월 1일 설치 건부터 중단 예정입니다. 12월 1일 이후 설치 건은 세금계산서로만 정산 가능합니다.`,
};

/** 정산 정보 등록 안내(대상: 아직 작업이 없는 기사) */
const REGISTRATION_TEMPLATE: Template = {
  label: "정산 정보 등록 안내",
  pushTitle: "정산 정보 등록 안내",
  pushBody:
    "「내 정보 → 정산 정보 등록」에서 사업자·계좌 정보와 증빙 종류를 미리 등록해 주세요. 12월 1일 설치 건부터 현금영수증 거래는 중단되고 세금계산서로만 정산됩니다.",
  smsSubject: "정산 정보 등록 안내",
  smsBody: `[아카라라이프] 정산 정보 등록 안내

■ 1. 정산 정보 등록
앱 「내 정보 → 정산 정보 등록」에서 사업자·계좌 정보와 증빙 종류(세금계산서/현금영수증)를 미리 등록해 주세요. 등록하셔야 설치 후 정산금이 지급됩니다.
앱 설치가 어려운 분(아이폰 등)은 아래 주소로 접속해 같은 기능을 이용하실 수 있습니다.
https://www.aqaralife-service.kr/installer

■ 2. 앞으로의 정산 일정
매월 1일 전월분 정산서 발행 → 5일까지 세금계산서 발행 → 그 달 중 지급

■ 3. 현금영수증 거래 중단
현금영수증 거래 방식은 12월 1일 설치 건부터 중단됩니다. 12월 1일 이후 설치 건은 세금계산서로만 정산 가능합니다.

기사 앱을 아직 설치하지 않으신 분은 아래 링크에서 설치해 주세요.
https://www.aqaralife-service.kr/installer-start.html`,
  noticeTitle: "정산 정보 등록 안내",
  noticeBody: `■ 1. 정산 정보 등록
「내 정보 → 정산 정보 등록」에서 사업자·계좌 정보와 증빙 종류(세금계산서/현금영수증)를 미리 등록해 주세요. 등록하셔야 설치 후 정산금이 지급됩니다.
세금계산서 기사님은 「내 정보 → 전자세금계산서 연동」을 해 두시면 앱에서 버튼 하나로 발행할 수 있습니다.

■ 2. 앞으로의 정산 일정
매월 1일 전월분 정산서 발행 → 5일까지 세금계산서 발행 → 그 달 중 지급

■ 3. 현금영수증 거래 중단
현금영수증 거래 방식은 12월 1일 설치 건부터 중단됩니다. 12월 1일 이후 설치 건은 세금계산서로만 정산 가능합니다.`,
};

const TEMPLATES: Template[] = [SETTLEMENT_TEMPLATE, REGISTRATION_TEMPLATE];

/** 문자 바이트(EUC-KR 기준 한글 2바이트). 90바이트 넘으면 LMS */
function smsBytes(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 127 ? 2 : 1;
  return n;
}

const maskPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : p;
};

export default function BroadcastClient({ limits }: { limits: Limits }) {
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<BroadcastScope>("WORKED");
  const [since, setSince] = useState("2026-10-01");
  const [includeInProgress, setIncludeInProgress] = useState(true);
  const [recipients, setRecipients] = useState<BroadcastRecipient[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<BroadcastMode>("BOTH");
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [smsSubject, setSmsSubject] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [noticeOn, setNoticeOn] = useState(true);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const wantPush = mode !== "SMS_ONLY";
  const wantSms = mode !== "PUSH_ONLY";
  const chosen = useMemo(() => (recipients ?? []).filter((r) => selected.has(r.id)), [recipients, selected]);
  const appCount = chosen.filter((r) => r.app).length;
  const pushCount = wantPush ? appCount : 0;
  const smsCount = !wantSms ? 0 : mode === "PUSH_ELSE_SMS" ? chosen.length - appCount : chosen.length;
  const bytes = smsBytes(smsBody);

  function load() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await listBroadcastRecipientsAction({ scope, since, includeInProgress });
      if (!r.ok) {
        setError(ERR[r.error] ?? r.error);
        return;
      }
      setRecipients(r.recipients);
      setSelected(new Set(r.recipients.map((x) => x.id)));
    });
  }

  function send() {
    setError(null);
    const lines = [
      `대상 ${chosen.length}명`,
      wantPush ? `앱 푸시 약 ${pushCount}명` : null,
      wantSms ? `문자 ${smsCount}명 (${bytes > 90 ? "LMS" : "SMS"})` : null,
      noticeOn ? `앱 공지 팝업 ${chosen.length}명` : null,
    ].filter(Boolean);
    if (!confirm(`정말 보낼까요? 보낸 뒤에는 취소할 수 없습니다.\n\n${lines.join("\n")}`)) return;
    startTransition(async () => {
      const r = await sendBroadcastAction({
        installerIds: chosen.map((c) => c.id),
        mode,
        push: { title: pushTitle, body: pushBody },
        sms: { subject: smsSubject, body: smsBody },
        notice: { enabled: noticeOn, title: noticeTitle, body: noticeBody },
      });
      if (!r.ok) setError(ERR[r.error] ?? r.error);
      else setResult(r);
    });
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const field = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";
  const ready =
    chosen.length > 0 &&
    (!wantPush || (pushTitle.trim() && pushBody.trim())) &&
    (!wantSms || smsBody.trim()) &&
    (!noticeOn || (noticeTitle.trim() && noticeBody.trim()));

  return (
    <div className="mx-auto max-w-6xl">
      <BackofficePageHeader title="기사 공지 발송" meta="고른 기사에게 앱 푸시·문자(LMS)를 보냅니다" />

      {/* 1. 대상 */}
      <section className="mb-5 rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-800">1. 받는 기사</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === "WORKED"} onChange={() => setScope("WORKED")} />
            작업이 있는 기사
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === "NOT_WORKED"} onChange={() => setScope("NOT_WORKED")} />
            작업이 없는 기사
          </label>
          {scope !== "ALL" ? (
            <>
              <label className="flex items-center gap-2 text-zinc-600">
                기준일
                <input type="date" className="rounded-md border border-zinc-300 px-2 py-1" value={since} onChange={(e) => setSince(e.target.value)} />
                {scope === "WORKED" ? "이후 완료(승인·확인 대기 포함)" : "이후 완료 건이 없는 기사"}
              </label>
              <label className="flex items-center gap-2 text-zinc-600">
                <input type="checkbox" checked={includeInProgress} onChange={(e) => setIncludeInProgress(e.target.checked)} />
                {scope === "WORKED" ? "진행 중(배정·응답 대기)인 기사 포함" : "진행 중(배정·응답 대기)인 기사도 작업 있음으로 보고 제외"}
              </label>
            </>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === "ALL"} onChange={() => setScope("ALL")} />
            활동 기사 전원
          </label>
          <button className={getBackofficeButtonClass("secondary", "sm")} disabled={pending} onClick={load}>
            대상 불러오기
          </button>
        </div>

        {recipients ? (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">
                선택 {chosen.length} / {recipients.length}명 · 앱 설치 {appCount}명
              </span>
              <button className="text-zinc-500 underline" onClick={() => setSelected(new Set(recipients.map((r) => r.id)))}>
                전체 선택
              </button>
              <button className="text-zinc-500 underline" onClick={() => setSelected(new Set())}>
                전체 해제
              </button>
              <span className="text-xs text-zinc-400">처음 보낼 때는 본인만 남기고 먼저 보내 보세요.</span>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-50">
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-2">기사</th>
                    <th className="px-2">지점</th>
                    <th className="px-2">전화</th>
                    <th className="px-2">앱</th>
                    {scope === "WORKED" ? <th className="px-2">작업</th> : null}
                    <th className="px-2">정산 정보</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                      </td>
                      <td className="px-2 font-medium">{r.name}</td>
                      <td className="px-2 text-zinc-600">{r.branch ?? "-"}</td>
                      <td className="px-2 text-zinc-600">{maskPhone(r.phone)}</td>
                      <td className="px-2">{r.app ? "O" : <span className="text-amber-700">미설치</span>}</td>
                      {scope === "WORKED" ? (
                        <td className="px-2 text-zinc-600">{r.reason === "DONE" ? "완료" : "진행 중"}</td>
                      ) : null}
                      <td className="px-2 text-zinc-600">
                        {r.settlementInfo === "APPROVED" ? "승인" : r.settlementInfo === "SUBMITTED" ? "확인 중" : r.settlementInfo === "REJECTED" ? "반려" : "미등록"}
                      </td>
                    </tr>
                  ))}
                  {recipients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-zinc-400">
                        조건에 맞는 기사가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. 내용 */}
      <section className="mb-5 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-800">2. 보내는 방법과 내용</h3>
          <div className="flex flex-wrap gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                className="text-sm text-blue-700 underline"
                onClick={() => {
                  setPushTitle(t.pushTitle);
                  setPushBody(t.pushBody);
                  setSmsSubject(t.smsSubject);
                  setSmsBody(t.smsBody);
                  setNoticeTitle(t.noticeTitle);
                  setNoticeBody(t.noticeBody);
                }}
              >
                「{t.label}」 문구 넣기
              </button>
            ))}
          </div>
        </div>
        <select className="mb-4 rounded-md border border-zinc-300 px-3 py-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as BroadcastMode)}>
          {(Object.keys(MODE_LABEL) as BroadcastMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={wantPush ? "" : "opacity-40"}>
            <div className="mb-1 text-xs font-bold text-zinc-600">앱 푸시 (알림창에 2~3줄만 보입니다)</div>
            <input
              className={`${field} mb-2`}
              placeholder="제목"
              maxLength={limits.pushTitle}
              disabled={!wantPush}
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
            />
            <textarea
              className={`${field} h-28`}
              placeholder="내용"
              maxLength={limits.pushBody}
              disabled={!wantPush}
              value={pushBody}
              onChange={(e) => setPushBody(e.target.value)}
            />
            <div className="text-right text-xs text-zinc-400">
              {pushBody.length}/{limits.pushBody}자
            </div>
          </div>
          <div className={wantSms ? "" : "opacity-40"}>
            <div className="mb-1 text-xs font-bold text-zinc-600">문자 (90바이트 넘으면 LMS)</div>
            <input
              className={`${field} mb-2`}
              placeholder="LMS 제목 (선택)"
              maxLength={limits.smsSubject}
              disabled={!wantSms}
              value={smsSubject}
              onChange={(e) => setSmsSubject(e.target.value)}
            />
            <textarea
              className={`${field} h-64 font-mono text-xs`}
              placeholder="내용"
              maxLength={limits.smsBody}
              disabled={!wantSms}
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
            />
            <div className={`text-right text-xs ${bytes > 2000 ? "text-red-600" : "text-zinc-400"}`}>
              {bytes}바이트 · {bytes > 90 ? "LMS" : "SMS"} {bytes > 2000 ? "· LMS 한도(2,000바이트) 초과" : ""}
            </div>
          </div>
        </div>
        <div className={`mt-5 border-t pt-4 ${noticeOn ? "" : "opacity-60"}`}>
          <label className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-600">
            <input type="checkbox" checked={noticeOn} onChange={(e) => setNoticeOn(e.target.checked)} />
            앱 공지 팝업도 띄우기 (앱·웹을 열면 전체 내용이 팝업으로 뜨고, 「확인」 전까지 다시 뜹니다. 「내 정보 → 본사 공지」에서 다시 볼 수 있음)
          </label>
          <input
            className={`${field} mb-2`}
            placeholder="팝업 제목"
            maxLength={limits.noticeTitle}
            disabled={!noticeOn}
            value={noticeTitle}
            onChange={(e) => setNoticeTitle(e.target.value)}
          />
          <textarea
            className={`${field} h-48`}
            placeholder="팝업 내용 (줄바꿈 그대로 보이고, http 주소는 눌러서 열 수 있습니다)"
            maxLength={limits.noticeBody}
            disabled={!noticeOn}
            value={noticeBody}
            onChange={(e) => setNoticeBody(e.target.value)}
          />
        </div>
      </section>

      {/* 3. 발송 */}
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-700">
          선택 {chosen.length}명 → {wantPush ? `푸시 약 ${pushCount}명` : ""}
          {wantPush && wantSms ? " · " : ""}
          {wantSms ? `문자 ${smsCount}명` : ""}
          {noticeOn ? ` · 앱 공지 팝업 ${chosen.length}명` : ""}
        </div>
        <button className={getBackofficeButtonClass("primary", "md")} disabled={pending || !ready || bytes > 2000} onClick={send}>
          {pending ? "보내는 중…" : "보내기"}
        </button>
      </section>

      {error ? <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
      {result ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">
            발송 완료 · 대상 {result.recipients}명 · 앱 공지 {result.noticeCreated}명 · 푸시 {result.pushSent}명 · 문자{" "}
            {result.smsSent}명
          </div>
          {result.failed.length > 0 ? (
            <div className="mt-2 text-red-700">
              실패 {result.failed.length}건:{" "}
              {result.failed.map((f) => `${f.name}(${f.channel === "PUSH" ? "푸시" : "문자"}: ${f.error})`).join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
