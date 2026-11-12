"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import type { PopbillLinkStatus, PopbillLinkView } from "@/lib/installer/popbill-tax-invoice";
import { getCertRegisterUrlAction, verifyPopbillLinkAction } from "./actions";
import * as ui from "../../ui";

const STATUS: Record<PopbillLinkStatus, { text: string; bg: string; color: string }> = {
  NOT_MEMBER: { text: "팝빌 미가입", bg: "#fee2e2", color: "#991b1b" },
  NO_CERT: { text: "인증서 미등록", bg: "#fef3c7", color: "#92400e" },
  CERT_INVALID: { text: "인증서 확인 필요", bg: "#fee2e2", color: "#991b1b" },
  READY: { text: "연동 완료", bg: "#d1fae5", color: "#065f46" },
};

const ERRORS: Record<string, string> = {
  NO_SETTLEMENT_INFO: "먼저 「정산 정보 등록」에서 사업자번호를 등록해 주세요.",
  NOT_MEMBER: "팝빌 가입이 확인되지 않습니다. 1단계를 먼저 해 주세요.",
  DISABLED: "아직 사용할 수 없는 기능입니다.",
  POPBILL_UNAVAILABLE: "팝빌에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  UNAUTHORIZED: "다시 로그인해 주세요.",
};

const RESULT_TEXT: Record<PopbillLinkStatus, string> = {
  NOT_MEMBER:
    "이 사업자번호로 팝빌 가입이 확인되지 않습니다. 가입할 때 연동 아이디(LinkID)를 입력했는지, 사업자번호가 같은지 확인해 주세요.",
  NO_CERT: "팝빌 가입은 확인됐습니다. 2단계에서 공동인증서를 등록해 주세요.",
  CERT_INVALID: "등록된 인증서를 사용할 수 없습니다(만료·폐기 등). 인증서를 다시 등록해 주세요.",
  READY: "연동이 완료됐습니다. 이제 정산서 화면에서 전자세금계산서를 바로 발행할 수 있습니다.",
};

function formatBizNo(v: string) {
  return v.length === 10 ? `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}` : v;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function TaxInvoiceLinkClient({
  view,
  linkId,
  signupUrl,
}: {
  view: PopbillLinkView;
  linkId: string;
  signupUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const link = view.link && !view.link.stale ? view.link : null;
  const status = link?.status ?? null;

  if (!view.businessNumber) {
    return (
      <main style={ui.page}>
        <div style={ui.panel}>
          <h1 style={ui.h1}>전자세금계산서 연동</h1>
          <div style={ui.card}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{ERRORS.NO_SETTLEMENT_INFO}</p>
          </div>
          <Link href="/installer/me/settlement-info" style={linkButton}>
            정산 정보 등록하러 가기
          </Link>
        </div>
      </main>
    );
  }

  const copyLinkId = async () => {
    try {
      await navigator.clipboard.writeText(linkId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const verify = () =>
    startTransition(async () => {
      setMessage(null);
      const r = await verifyPopbillLinkAction();
      if (!r.ok) {
        setMessage({ text: ERRORS[r.error] ?? ERRORS.POPBILL_UNAVAILABLE, ok: false });
        return;
      }
      const extra = r.status === "CERT_INVALID" && r.invalidReason ? ` (${r.invalidReason})` : "";
      setMessage({ text: RESULT_TEXT[r.status] + extra, ok: r.status === "READY" });
      router.refresh();
    });

  const openCert = () =>
    startTransition(async () => {
      setMessage(null);
      // 팝업 차단을 피하려고 창을 먼저 연 뒤 주소를 넣는다.
      const win = window.open("about:blank", "_blank");
      const r = await getCertRegisterUrlAction();
      if (!r.ok) {
        win?.close();
        setMessage({ text: ERRORS[r.error] ?? ERRORS.POPBILL_UNAVAILABLE, ok: false });
        return;
      }
      if (win) win.location.href = r.url;
      else window.location.href = r.url;
    });

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <h1 style={ui.h1}>전자세금계산서 연동</h1>
        <p style={{ ...ui.sub, wordBreak: "keep-all" }}>
          한 번만 연동해 두면 매달 정산서 화면에서 버튼 하나로 본사에 전자세금계산서가 발행됩니다. 발행 수수료는 본사가
          부담합니다.
        </p>

        <div style={ui.card}>
          <div style={rowBetween}>
            <span style={ui.rowLabel}>사업자번호</span>
            {status ? <span style={ui.badge(STATUS[status].bg, STATUS[status].color)}>{STATUS[status].text}</span> : null}
          </div>
          <div style={{ ...ui.rowValue, fontSize: 18, marginTop: 4 }}>{formatBizNo(view.businessNumber)}</div>
          {view.businessName ? <div style={{ fontSize: 13, color: "#71717a", marginTop: 2 }}>{view.businessName}</div> : null}
          {link?.status === "READY" ? (
            <div style={{ fontSize: 13, color: "#52525b", marginTop: 10 }}>
              인증서 만료일 {formatDate(link.certExpiresAt)} · 확인 {formatDate(link.checkedAt)}
            </div>
          ) : null}
          {view.link?.stale ? (
            <div style={{ fontSize: 13, color: "#b42318", marginTop: 10 }}>
              정산 정보의 사업자번호가 바뀌었습니다. 아래 「연동 확인」을 다시 해 주세요.
            </div>
          ) : null}
        </div>

        <Step n={1} title="팝빌 회원가입" done={status !== null && status !== "NOT_MEMBER"}>
          <p style={stepText}>
            팝빌 사이트에서 <b>위 사업자번호</b>로 가입해 주세요. 가입 화면의 <b>연동 아이디(LinkID)</b> 칸에 아래 값을 꼭
            입력해야 합니다.
          </p>
          <div style={copyRow}>
            <code style={codeBox}>{linkId}</code>
            <button type="button" onClick={copyLinkId} style={copyButton}>
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
          <a href={signupUrl} target="_blank" rel="noreferrer" style={{ ...linkButton, marginTop: 10 }}>
            팝빌 가입하러 가기
          </a>
        </Step>

        <Step n={2} title="공동인증서 등록" done={status === "READY"}>
          <p style={stepText}>
            사업자 범용 또는 전자세금용 공동인증서를 팝빌에 등록해 주세요. 인증서가 있는 PC에서 팝빌에 로그인해 등록해도
            됩니다.
          </p>
          <button type="button" onClick={openCert} disabled={pending} style={{ ...ui.secondaryButton, marginTop: 4 }}>
            인증서 등록 화면 열기
          </button>
        </Step>

        <Step n={3} title="연동 확인" done={status === "READY"}>
          <p style={stepText}>가입과 인증서 등록을 마쳤으면 눌러 주세요.</p>
          <button type="button" onClick={verify} disabled={pending} style={ui.primaryButton(pending)}>
            {pending ? "확인 중…" : "연동 확인"}
          </button>
        </Step>

        {message ? (
          <div style={{ ...messageBox, ...(message.ok ? okBox : failBox) }} role="status">
            {message.text}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div style={ui.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={stepNum(done)}>{done ? "✓" : n}</span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

const rowBetween: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const stepText: CSSProperties = { fontSize: 14, lineHeight: 1.6, color: "#3f3f46", margin: "0 0 10px", wordBreak: "keep-all" };
const stepNum = (done: boolean): CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 800,
  background: done ? "#059669" : "#111",
  color: "#fff",
});
const copyRow: CSSProperties = { display: "flex", gap: 8, alignItems: "stretch" };
const codeBox: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  padding: "0 14px",
  minHeight: 48,
  borderRadius: 10,
  background: "#f4f4f5",
  border: `1px solid ${ui.BORDER}`,
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: 1,
};
const copyButton: CSSProperties = { ...ui.secondaryButton, width: 80, minHeight: 48 };
const linkButton: CSSProperties = {
  ...ui.secondaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  boxSizing: "border-box",
};
const messageBox: CSSProperties = { borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 1.6, wordBreak: "keep-all" };
const okBox: CSSProperties = { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" };
const failBox: CSSProperties = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" };
