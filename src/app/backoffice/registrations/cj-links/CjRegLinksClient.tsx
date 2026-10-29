"use client";

import Link from "next/link";
import { useState } from "react";
import { formatKrPhone } from "@/lib/phone";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import {
  parseCjRegLinkFileAction,
  sendCjRegLinksAction,
  type CjLinkRecipient,
} from "./actions";

// 문자 본문의 {link} 자리에 주문마다 다른 /reg/cj/<token> 주소가 들어간다.
const DEFAULT_BODY = [
  "[아카라라이프]",
  "안녕하세요, 아카라라이프입니다.",
  "CJ온스타일에서 구매하신 도어락의 무상 A/S(2년) 등록 안내드립니다.",
  "설치를 마치셨다면 아래 링크에서 제품 일련번호(SN)와 설치일을 등록해 주세요.",
  "{link}",
  "※ 링크는 3개월간 사용하실 수 있습니다.",
  "감사합니다.",
].join("\n");

const ERROR_MESSAGE: Record<string, string> = {
  UNAUTHORIZED: "권한이 없습니다.",
  FILE_REQUIRED: "엑셀 파일을 선택해 주세요.",
  NO_ROWS: "읽을 수 있는 행이 없습니다. 헤더에 '출고일자', '주문번호', '연락처'가 있는지 확인해 주세요.",
  PARSE_FAILED: "엑셀을 읽지 못했습니다.",
  NO_RECIPIENTS: "보낼 대상이 없습니다.",
  BODY_REQUIRED: "문자 내용을 입력해 주세요.",
  LINK_PLACEHOLDER_REQUIRED: "문자 내용에 {link} 를 남겨 두세요. 링크가 들어갈 자리입니다.",
};

export default function CjRegLinksClient() {
  const [recipients, setRecipients] = useState<CjLinkRecipient[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState(DEFAULT_BODY);

  const [parsing, setParsing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: string[] } | null>(null);

  async function onUpload(formData: FormData) {
    setParsing(true);
    setError(null);
    setResult(null);
    const res = await parseCjRegLinkFileAction(formData);
    setParsing(false);

    if (!res.ok) {
      setError(ERROR_MESSAGE[res.error] ?? res.error);
      return;
    }
    setRecipients(res.recipients);
    setSkipped(res.skipped);
    // 아직 등록하지 않은 주문만 미리 골라 둔다.
    setSelected(
      new Set(res.recipients.filter((r) => r.registered < r.quantity).map((r) => r.orderNo)),
    );
  }

  function toggle(orderNo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  }

  async function onSend() {
    const tokens = recipients.filter((r) => selected.has(r.orderNo)).map((r) => r.token);
    if (tokens.length === 0) return;
    if (
      !window.confirm(
        `${tokens.length}명에게 문자를 보냅니다. 발송 후에는 취소할 수 없습니다. 진행할까요?`,
      )
    ) {
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);
    const res = await sendCjRegLinksAction({ tokens, body });
    setSending(false);

    if (!res.ok) {
      setError(ERROR_MESSAGE[res.error] ?? "발송에 실패했습니다.");
      return;
    }
    setResult({
      sent: res.sent,
      failed: res.failed.map((f) => `${f.orderNo}(${formatKrPhone(f.phone)})`),
    });
  }

  const sample = recipients[0]?.url ?? "https://www.aqaralife-service.kr/reg/cj/…";
  const preview = body.replaceAll("{link}", sample);
  const bytes = new TextEncoder().encode(preview).length;
  const missingInstaller = recipients.filter((r) => !r.installerPhone);

  return (
    <div>
      <BackofficePageHeader
        title="CJ 2년 등록 링크 문자"
        meta={recipients.length ? `대상 ${recipients.length}건 · 선택 ${selected.size}건` : undefined}
        leading={
          <Link href="/backoffice/registrations?tab=query" className={getBackofficeButtonClass("secondary", "sm")}>
            ← 설치 정보 조회
          </Link>
        }
      />

      <p className="mb-4 max-w-3xl text-sm leading-6 text-zinc-600">
        기사배정 엑셀(출고일자 · 주문번호 · 연락처 · 지점명)을 올리면 주문마다 전용 링크를 만듭니다.
        고객은 링크에서 SN 과 설치일(출고일~오늘)만 넣으면 기사 확인 없이 무상 A/S 2년으로 바로
        등록됩니다. 기사 연락처 칸에는 지점명의 업체 연락처가 들어가고, 링크는 3개월 동안 유효합니다.
      </p>

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
              실패 {result.failed.length}건: {result.failed.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-5">
        <form action={onUpload} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            className="block cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-700"
          />
          <button type="submit" disabled={parsing} className={getBackofficeButtonClass("primary", "md")}>
            {parsing ? "읽는 중…" : "엑셀 읽기"}
          </button>
        </form>
        {skipped > 0 ? (
          <p className="mt-2 text-xs text-amber-700">주문번호·연락처·출고일자를 읽지 못한 {skipped}행은 건너뛰었습니다.</p>
        ) : null}
        {missingInstaller.length > 0 ? (
          <p className="mt-2 text-xs text-amber-700">
            업체 명부에 없는 지점 {[...new Set(missingInstaller.map((r) => r.branchName))].join(", ")} —{" "}
            {missingInstaller.length}건은 기사 연락처 없이 등록됩니다.
          </p>
        ) : null}
      </section>

      {recipients.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-800">문자 내용</h3>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-zinc-500"
            />
            <p className="mt-2 text-xs text-zinc-500">
              {"{link}"} 자리에 주문마다 다른 링크가 들어갑니다.
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
              <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-zinc-700">{preview}</pre>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(recipients.map((r) => r.orderNo)))}
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

            <div className="max-h-[480px] overflow-auto rounded-lg border border-zinc-200">
              {recipients.map((r) => (
                <label
                  key={r.orderNo}
                  className="flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0 hover:bg-zinc-50"
                >
                  <input type="checkbox" checked={selected.has(r.orderNo)} onChange={() => toggle(r.orderNo)} />
                  <span className="font-medium text-zinc-800">{formatKrPhone(r.userPhone)}</span>
                  <span className="truncate text-xs text-zinc-500">{r.branchName}</span>
                  <span className="text-xs text-zinc-400">출고 {r.shipDate}</span>
                  {r.registered >= r.quantity ? (
                    <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      등록 완료
                    </span>
                  ) : null}
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`${r.registered >= r.quantity ? "" : "ml-auto "}shrink-0 text-xs text-zinc-500 underline`}
                  >
                    링크
                  </a>
                </label>
              ))}
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
      ) : null}
    </div>
  );
}
