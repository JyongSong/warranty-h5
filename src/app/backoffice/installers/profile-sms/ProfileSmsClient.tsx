"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatKrPhone } from "@/lib/phone";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import {
  listProfileSmsRecipientsAction,
  sendProfileSmsAction,
  type Recipient,
  type RecipientScope,
} from "./actions";

// 문자 본문의 {link} 자리에 /installer/me/edit 주소가 들어간다.
const DEFAULT_BODY = [
  "[아카라라이프]",
  "안녕하세요, 아카라라이프입니다.",
  "정식 설치기사로 등록되셨습니다.",
  "아래 링크에서 휴대폰 인증 후 정보를 확인·수정해 주세요.",
  "{link}",
  "감사합니다.",
].join("\n");

const SCOPE_LABEL: Record<RecipientScope, string> = {
  ROSTER: "이번 명단 전체",
  ROSTER_UNCONFIRMED: "이번 명단 중 미제출",
};

export default function ProfileSmsClient({ baseUrl }: { baseUrl: string }) {
  const [scope, setScope] = useState<RecipientScope>("ROSTER");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState(DEFAULT_BODY);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: Recipient[] } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const res = await listProfileSmsRecipientsAction(scope);
      if (cancelled) return;
      if (!res.ok) {
        setError("대상을 불러오지 못했습니다.");
        setLoading(false);
        return;
      }
      setRecipients(res.recipients);
      // 처음에는 전원 선택. 시험 발송할 때만 몇 명으로 줄이면 된다.
      setSelected(new Set(res.recipients.map((r) => r.id)));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSend() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `${ids.length}명에게 문자를 보냅니다. 발송 후에는 취소할 수 없습니다. 진행할까요?`,
      )
    ) {
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);

    const res = await sendProfileSmsAction({ installerIds: ids, body });
    setSending(false);

    if (!res.ok) {
      setError(
        {
          NO_RECIPIENTS: "보낼 대상이 없습니다.",
          BODY_REQUIRED: "문자 내용을 입력해 주세요.",
          LINK_PLACEHOLDER_REQUIRED: "문자 내용에 {link} 를 남겨 두세요. 링크가 들어갈 자리입니다.",
          UNAUTHORIZED: "권한이 없습니다.",
        }[res.error] ?? "발송에 실패했습니다.",
      );
      return;
    }

    setResult({
      sent: res.sent,
      failed: res.failed.map((f) => ({
        id: f.phone,
        name: f.name,
        phone: f.phone,
        branch: null,
        confirmed: false,
      })),
    });
  }

  const preview = body.replaceAll("{link}", `${baseUrl}/installer/me/edit`);
  const bytes = new TextEncoder().encode(preview).length;

  return (
    <div>
      <BackofficePageHeader
        title="기사 정보 확인 문자"
        meta={loading ? "불러오는 중…" : `대상 ${recipients.length}명 · 선택 ${selected.size}명`}
        leading={
          <Link href="/backoffice/installers" className={getBackofficeButtonClass("secondary", "sm")}>
            ← 기사 관리
          </Link>
        }
      />

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-semibold">{result.sent}명에게 발송했습니다.</div>
          {result.failed.length > 0 ? (
            <div className="mt-1 text-red-700">
              실패 {result.failed.length}명:{" "}
              {result.failed.map((f) => `${f.name}(${formatKrPhone(f.phone)})`).join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-800">문자 내용</h3>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-zinc-500"
          />
          <p className="mt-2 text-xs text-zinc-500">
            {"{link}"} 자리에 링크가 들어갑니다. 링크는 모두에게 같고, 열면 본인 휴대폰 인증을 거칩니다.
          </p>

          <div className="mt-4 rounded-lg bg-zinc-50 p-3">
            <div className="mb-1.5 text-xs font-semibold text-zinc-600">
              미리보기 · {bytes}바이트
              {bytes > 90 ? (
                <span className="ml-1 text-amber-700">(90바이트 초과 — LMS 로 발송됩니다)</span>
              ) : (
                <span className="ml-1 text-zinc-500">(SMS)</span>
              )}
            </div>
            <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-zinc-700">
              {preview}
            </pre>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">받는 사람</h3>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as RecipientScope)}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
            >
              {(Object.keys(SCOPE_LABEL) as RecipientScope[]).map((key) => (
                <option key={key} value={key}>{SCOPE_LABEL[key]}</option>
              ))}
            </select>
          </div>

          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(recipients.map((r) => r.id)))}
              className={getBackofficeButtonClass("secondary", "sm")}
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className={getBackofficeButtonClass("secondary", "sm")}
            >
              전체 해제
            </button>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border border-zinc-200">
            {recipients.map((recipient) => (
              <label
                key={recipient.id}
                className="flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(recipient.id)}
                  onChange={() => toggle(recipient.id)}
                />
                <span className="font-medium text-zinc-800">{recipient.name}</span>
                <span className="text-zinc-500">{formatKrPhone(recipient.phone)}</span>
                {recipient.branch ? (
                  <span className="truncate text-xs text-zinc-400">{recipient.branch}</span>
                ) : null}
                {recipient.confirmed ? (
                  <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    제출함
                  </span>
                ) : null}
              </label>
            ))}
            {!loading && recipients.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-500">대상이 없습니다.</div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={sending || selected.size === 0}
            className={`${getBackofficeButtonClass("primary", "lg")} mt-4 w-full`}
          >
            {sending ? "발송 중…" : `${selected.size}명에게 발송`}
          </button>
          <p className="mt-2 text-xs text-zinc-500">
            처음에는 2~3명만 골라 시험 발송하고, 링크가 제대로 열리는지 확인한 뒤 전체로 보내세요.
          </p>
        </section>
      </div>
    </div>
  );
}
