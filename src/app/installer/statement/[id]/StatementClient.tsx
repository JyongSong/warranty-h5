"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { compressImage } from "@/lib/installer/image";
import type { HqInvoiceInfo, StatementLineItem, StatementView } from "@/lib/installation/settlement/statements";
import { TAX_DOC_TYPE_LABEL, formatBusinessNumber } from "@/lib/installer/settlement-info-shared";
import PhotoPicker from "../../PhotoPicker";
import * as ui from "../../ui";
import {
  getEvidenceUploadTargetsAction,
  getInvoiceViewUrlAction,
  issueTaxInvoiceAction,
  submitCashReceiptAction,
  submitTaxInvoiceAction,
} from "./actions";

let supabaseBrowser: ReturnType<typeof createClient> | null = null;
function getSupabaseBrowser() {
  if (!supabaseBrowser) {
    supabaseBrowser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    );
  }
  return supabaseBrowser;
}

const won = (n: number) => `${n.toLocaleString()}원`;

const ERR: Record<string, string> = {
  PHOTO_COUNT_INVALID: "사진 개수를 확인해 주세요.",
  PHOTO_MISSING: "사진 업로드가 끝나지 않았습니다. 다시 첨부해 주세요.",
  DATE_INVALID: "날짜를 입력해 주세요.",
  RECEIPT_NO_INVALID: "승인번호를 정확히 입력해 주세요.",
  NOT_SUBMITTABLE: "지금은 제출할 수 없는 상태입니다. 새로고침해 주세요.",
  ALREADY_PAID: "이미 지급된 정산서입니다.",
  NOT_PAID_YET: "본사 지급 후에 등록할 수 있습니다.",
  FLOW_MISMATCH: "정산 정보의 증빙 종류와 맞지 않습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

// 팝빌 발행 오류 → 안내 문구
const ISSUE_ERR: Record<string, string> = {
  LINK_NOT_MEMBER: "팝빌 가입이 확인되지 않습니다. 「전자세금계산서 연동」을 먼저 해 주세요.",
  LINK_NO_CERT: "팝빌에 공동인증서가 등록되어 있지 않습니다. 「전자세금계산서 연동」에서 등록해 주세요.",
  LINK_CERT_INVALID: "등록된 공동인증서를 쓸 수 없습니다(만료 등). 인증서를 다시 등록해 주세요.",
  SETTLEMENT_INFO_NOT_APPROVED: "정산 정보가 아직 승인되지 않았습니다.",
  HQ_INFO_MISSING: "본사 정보가 준비되지 않았습니다. 본사에 문의해 주세요.",
  ALREADY_ISSUED: "이미 발행된 정산서입니다. 새로고침해 주세요.",
  IN_PROGRESS: "발행이 진행 중입니다. 잠시 후 새로고침해 주세요.",
  TOO_EARLY: "작성일자(정산 월 말일)가 지나야 발행할 수 있습니다. 다음 달 1일부터 발행해 주세요.",
  UNCERTAIN: "발행 결과를 확인하지 못했습니다. 잠시 후 다시 눌러 주세요(중복 발행되지 않습니다).",
  NOT_SUBMITTABLE: ERR.NOT_SUBMITTABLE,
  ALREADY_PAID: ERR.ALREADY_PAID,
  FLOW_MISMATCH: ERR.FLOW_MISMATCH,
  UNAUTHORIZED: ERR.UNAUTHORIZED,
  DISABLED: "지금은 앱 발행을 쓸 수 없습니다. 아래 방법으로 제출해 주세요.",
  POPBILL_UNAVAILABLE: "팝빌에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

type PopbillState = { ready: boolean } | null;

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 다음 달 10일 (월합계 세금계산서 발행 기한) */
function invoiceDeadline(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 10));
  return `${d.getUTCMonth() + 1}월 10일`;
}

export default function StatementClient({
  statement: s,
  lines,
  hq,
  ymLabel,
  writeDate,
  popbill,
}: {
  statement: StatementView;
  lines: StatementLineItem[];
  hq: HqInvoiceInfo;
  ymLabel: string;
  writeDate: string;
  popbill: PopbillState;
}) {
  const canSubmitTax =
    s.flow === "TAX" && !s.paidAt && (s.evidenceStatus === "PENDING" || s.evidenceStatus === "REJECTED");
  const canSubmitCash =
    s.flow === "CASH" && Boolean(s.paidAt) && (s.evidenceStatus === "PENDING" || s.evidenceStatus === "REJECTED");

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <Link href={`/installer/history?ym=${s.ym}`} style={backLink}>
          ‹ 이력·정산
        </Link>
        <h1 style={ui.h1}>
          {ymLabel} {s.seq > 1 ? `추가 정산서 ${s.seq - 1}` : "정산서"}
        </h1>
        {s.seq > 1 ? (
          <p style={{ ...ui.sub, marginBottom: 12 }}>{ymLabel}에 완료됐지만 정산서 발행 뒤에 승인된 건입니다.</p>
        ) : null}

        <div style={{ ...ui.card, textAlign: "center", padding: "18px 16px" }}>
          <div style={{ fontSize: 13, color: "#71717a", fontWeight: 700 }}>
            {s.paidAt ? "지급 완료" : "지급 예정 금액"}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, margin: "6px 0" }}>{won(s.payAmount)}</div>
          <div style={{ fontSize: 13, color: "#71717a" }}>
            정산 {won(s.baseAmount)}
            {s.vatAmount ? ` + 부가세 ${won(s.vatAmount)}` : ""} · {s.lineCount}건
          </div>
        </div>

        <StatusBox s={s} ym={s.ym} appIssue={popbill?.ready ?? false} />

        <details style={{ ...ui.card, padding: "12px 16px" }}>
          <summary style={{ fontSize: 14, fontWeight: 700, cursor: "pointer" }}>포함된 작업 {lines.length}건 보기</summary>
          <div style={{ marginTop: 8 }}>
            {lines.map((l) => (
              <div key={l.id} style={lineRow}>
                <span>
                  {l.completedDate} · {l.sourceType === "AS" ? "A/S" : "설치"}
                </span>
                <span style={{ fontWeight: 700 }}>{won(l.totalAmount)}</span>
              </div>
            ))}
          </div>
        </details>

        {s.ntsConfirmNum ? <IssuedInvoiceCard s={s} /> : null}

        {canSubmitTax && popbill ? (
          <>
            <PopbillIssueCard s={s} ready={popbill.ready} />
            <details style={{ ...ui.card, padding: "12px 16px" }}>
              <summary style={{ fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                직접 발행하고 사진으로 제출하기
              </summary>
              <div style={{ marginTop: 12 }}>
                <TaxInvoiceForm s={s} hq={hq} writeDate={writeDate} ymLabel={ymLabel} />
              </div>
            </details>
          </>
        ) : canSubmitTax ? (
          <TaxInvoiceForm s={s} hq={hq} writeDate={writeDate} ymLabel={ymLabel} />
        ) : null}
        {canSubmitCash ? <CashReceiptForm s={s} hq={hq} /> : null}
      </div>
    </main>
  );
}

function StatusBox({ s, ym, appIssue }: { s: StatementView; ym: string; appIssue: boolean }) {
  if (s.infoStatus === null || !s.flow) {
    return (
      <Notice tone="warn" title="정산 정보를 먼저 등록해 주세요">
        증빙 종류(세금계산서·현금영수증)와 계좌가 있어야 정산이 진행됩니다.
        <Link href="/installer/me/settlement-info" style={inlineLink}>
          정산 정보 등록하기 ›
        </Link>
      </Notice>
    );
  }
  const docLabel = s.taxDocType ? TAX_DOC_TYPE_LABEL[s.taxDocType] : "";
  if (s.evidenceStatus === "REJECTED") {
    return (
      <Notice tone="error" title={`${docLabel} 반려 · 다시 제출해 주세요`}>
        사유: {s.evidenceRejectReason}
      </Notice>
    );
  }
  if (s.flow === "TAX") {
    if (s.paidAt) return <Notice tone="ok" title="지급 완료">정산금이 지급됐습니다.</Notice>;
    if (s.evidenceStatus === "CONFIRMED") {
      return (
        <Notice tone="ok" title={s.ntsConfirmNum ? "전자세금계산서 발행 완료" : "세금계산서 확인 완료"}>
          곧 지급됩니다.
        </Notice>
      );
    }
    if (s.evidenceStatus === "SUBMITTED") return <Notice tone="info" title="본사 확인 중">세금계산서를 확인하고 있습니다.</Notice>;
    return (
      <Notice tone="info" title={`세금계산서를 발행해 주세요 (${invoiceDeadline(ym)}까지)`}>
        {appIssue
          ? "아래 「전자세금계산서 발행」 버튼을 눌러 주세요. 발행되면 바로 지급 대상이 됩니다."
          : "아래 정보로 세금계산서를 발행한 뒤 사진을 올려 주세요. 확인 후 지급됩니다."}
      </Notice>
    );
  }
  // 현금영수증
  const ending = <p style={discontinue}>※ 현금영수증 거래 방식은 2026년 12월 1일 설치 건부터 중단됩니다.</p>;
  if (!s.paidAt) {
    return (
      <Notice tone="info" title="본사 지급 대기">
        지급되면 알림을 드립니다. 지급 후 바로 현금영수증을 발급하고 승인번호를 등록해 주세요.
        {ending}
      </Notice>
    );
  }
  if (s.evidenceStatus === "CONFIRMED") return <Notice tone="ok" title="완료">현금영수증 확인이 끝났습니다.{ending}</Notice>;
  if (s.evidenceStatus === "SUBMITTED") return <Notice tone="info" title="본사 확인 중">현금영수증을 확인하고 있습니다.</Notice>;
  return (
    <Notice tone="error" title="현금영수증을 등록해 주세요">
      정산금이 지급됐습니다. 현금영수증 승인번호를 등록하기 전에는 앱의 다른 기능을 쓸 수 없습니다.
      {ending}
    </Notice>
  );
}

function PopbillIssueCard({ s, ready }: { s: StatementView; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [late, setLate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <div style={ui.card}>
        <div style={ui.label}>앱에서 전자세금계산서 발행</div>
        <p style={{ ...hint, marginTop: 0 }}>
          팝빌 연동을 한 번 해 두면 이 화면에서 버튼 하나로 본사에 전자세금계산서가 발행되고, 사진을 올릴 필요가 없습니다.
        </p>
        <Link href="/installer/me/tax-invoice" style={linkBtn}>
          전자세금계산서 연동하기
        </Link>
      </div>
    );
  }

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const r = await issueTaxInvoiceAction(s.id, late);
      if (r.ok) {
        setConfirming(false);
        setLate(false);
        router.refresh();
      } else if (r.error === "LATE_ISSUE") {
        // 기한이 지난 건: 지연발행 안내를 보여 주고 한 번 더 확인받는다.
        setLate(true);
        setConfirming(true);
      } else {
        const base = ISSUE_ERR[r.error] ?? ISSUE_ERR.POPBILL_UNAVAILABLE;
        setError(r.error === "POPBILL_FAILED" ? `발행 실패: ${r.detail ?? ""}` : base);
      }
    } catch (e) {
      console.error(e);
      setError(ISSUE_ERR.POPBILL_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={ui.card}>
      <div style={ui.label}>앱에서 전자세금계산서 발행</div>
      <p style={{ ...hint, marginTop: 0 }}>
        본사 앞으로 공급가액 {won(s.baseAmount)} + 세액 {won(s.vatAmount)} = {won(s.payAmount)} 전자세금계산서가
        발행됩니다. 발행하면 본사 확인 없이 바로 지급 대상이 됩니다.
      </p>
      {s.popbillError && !error && !late ? <p style={ui.errorText}>지난 발행 시도 실패: {s.popbillError}</p> : null}
      {late ? (
        <p style={lateBox}>
          발행 기한({invoiceDeadline(s.ym)})이 지나 <b>지연발행</b>됩니다. 공급자(기사님)에게 지연발급 가산세가 부과될 수
          있습니다. 그래도 발행하시겠습니까?
        </p>
      ) : null}
      {confirming ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{ ...ui.secondaryButton, flex: 1 }}
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              setLate(false);
            }}
          >
            취소
          </button>
          <button type="button" style={{ ...ui.primaryButton(busy), flex: 2 }} disabled={busy} onClick={issue}>
            {busy ? "발행 중…" : late ? "지연발행 확정" : "발행 확정"}
          </button>
        </div>
      ) : (
        <button type="button" style={ui.primaryButton(false)} onClick={() => setConfirming(true)}>
          전자세금계산서 발행
        </button>
      )}
      {error ? <p style={ui.errorText}>{error}</p> : null}
    </div>
  );
}

function IssuedInvoiceCard({ s }: { s: StatementView }) {
  const [error, setError] = useState<string | null>(null);
  async function view() {
    setError(null);
    const win = window.open("about:blank", "_blank");
    const r = await getInvoiceViewUrlAction(s.id);
    if (!r.ok) {
      win?.close();
      setError(ISSUE_ERR[r.error] ?? ISSUE_ERR.POPBILL_UNAVAILABLE);
      return;
    }
    if (win) win.location.href = r.url;
    else window.location.href = r.url;
  }
  return (
    <div style={ui.card}>
      <div style={ui.label}>발행한 전자세금계산서</div>
      <CopyRow label="국세청 승인번호" value={s.ntsConfirmNum} />
      {s.invoiceIssueDate ? <CopyRow label="발행일" value={s.invoiceIssueDate} /> : null}
      <button type="button" style={{ ...ui.secondaryButton, marginTop: 8 }} onClick={view}>
        세금계산서 보기
      </button>
      {error ? <p style={ui.errorText}>{error}</p> : null}
    </div>
  );
}

function HqCard({ hq, extra }: { hq: HqInvoiceInfo; extra?: Array<[string, string]> }) {
  const rows: Array<[string, string | null]> = [
    ["사업자등록번호", hq.businessNumber ? formatBusinessNumber(hq.businessNumber.replace(/\D/g, "")) : null],
    ["상호", hq.businessName],
    ["대표자", hq.representative],
    ["주소", hq.address],
    ["업태 / 종목", hq.businessType || hq.businessItem ? `${hq.businessType ?? "-"} / ${hq.businessItem ?? "-"}` : null],
    ["이메일", hq.email],
    ...(extra ?? []),
  ];
  return (
    <div style={ui.card}>
      <div style={ui.label}>공급받는자 (본사)</div>
      {rows.map(([label, value]) => (
        <CopyRow key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={copyRow}>
      <div style={{ minWidth: 0 }}>
        <div style={ui.rowLabel}>{label}</div>
        <div style={ui.rowValue}>{value ?? "본사에 문의"}</div>
      </div>
      {value ? (
        <button
          type="button"
          style={copyBtn}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* 복사가 막힌 기기: 길게 눌러 복사 */
            }
          }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      ) : null}
    </div>
  );
}

async function uploadPhotos(statementId: string, photos: File[]): Promise<string[]> {
  if (photos.length === 0) return [];
  const res = await getEvidenceUploadTargetsAction(statementId, photos.length);
  if (!res.ok) throw new Error(res.error);
  const supabase = getSupabaseBrowser();
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const t = res.targets[i];
    const up = await supabase.storage.from(res.bucket).uploadToSignedUrl(t.path, t.token, photos[i]);
    if (up.error) throw up.error;
    paths.push(t.path);
  }
  return paths;
}

function usePhotos(max: number) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [compressing, setCompressing] = useState(false);
  async function add(list: FileList | null) {
    if (!list) return;
    setCompressing(true);
    const incoming = Array.from(list).slice(0, max - photos.length);
    const compressed = await Promise.all(incoming.map(compressImage));
    setPhotos((prev) => [...prev, ...compressed].slice(0, max));
    setCompressing(false);
  }
  return { photos, compressing, add, remove: (i: number) => setPhotos((p) => p.filter((_, j) => j !== i)) };
}

function TaxInvoiceForm({
  s,
  hq,
  writeDate,
  ymLabel,
}: {
  s: StatementView;
  hq: HqInvoiceInfo;
  writeDate: string;
  ymLabel: string;
}) {
  const router = useRouter();
  const [issueDate, setIssueDate] = useState(writeDate);
  const { photos, compressing, add, remove } = usePhotos(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const photoPaths = await uploadPhotos(s.id, photos);
      const res = await submitTaxInvoiceAction({ statementId: s.id, photoPaths, issueDate });
      if (!res.ok) setError(ERR[res.error] ?? ERR.DEFAULT);
      else router.refresh();
    } catch (e) {
      console.error(e);
      setError(ERR.DEFAULT);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <HqCard hq={hq} />
      <div style={ui.card}>
        <div style={ui.label}>세금계산서 작성 내용</div>
        <CopyRow label="작성일자" value={writeDate} />
        <CopyRow label="품목" value={`설치 용역 (${ymLabel}${s.seq > 1 ? " 추가분" : ""})`} />
        <CopyRow label="공급가액" value={String(s.baseAmount)} />
        <CopyRow label="세액 (10%)" value={String(s.vatAmount)} />
        <CopyRow label="합계" value={String(s.payAmount)} />
        <p style={hint}>홈택스(전자) 또는 종이 세금계산서 모두 됩니다. 종이 세금계산서는 원본을 본사로 보내 주세요.</p>
      </div>

      <div style={ui.card}>
        <label style={{ display: "block" }}>
          <span style={ui.label}>발행한 세금계산서의 작성일자</span>
          <input type="date" style={ui.input} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
      </div>
      <PhotoPicker
        label="세금계산서 사진 (최대 3장)"
        photos={photos}
        max={3}
        busy={compressing || busy}
        onAdd={add}
        onRemove={remove}
      />
      {error ? <p style={ui.errorText}>{error}</p> : null}
      <button
        type="button"
        style={ui.primaryButton(busy || compressing || photos.length === 0 || !issueDate)}
        disabled={busy || compressing || photos.length === 0 || !issueDate}
        onClick={submit}
      >
        {busy ? "제출 중…" : "세금계산서 제출"}
      </button>
    </>
  );
}

function CashReceiptForm({ s, hq }: { s: StatementView; hq: HqInvoiceInfo }) {
  const router = useRouter();
  const [receiptNo, setReceiptNo] = useState(s.cashReceiptNo ?? "");
  const [receiptDate, setReceiptDate] = useState(todayKst());
  const { photos, compressing, add, remove } = usePhotos(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = receiptNo.replace(/\W/g, "").length >= 6 && Boolean(receiptDate);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const photoPaths = await uploadPhotos(s.id, photos);
      const res = await submitCashReceiptAction({ statementId: s.id, receiptNo, receiptDate, photoPaths });
      if (!res.ok) setError(ERR[res.error] ?? ERR.DEFAULT);
      else router.refresh();
    } catch (e) {
      console.error(e);
      setError(ERR.DEFAULT);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={ui.card}>
        <div style={ui.label}>현금영수증 발급 방법</div>
        <p style={{ ...hint, marginTop: 0 }}>
          <b>지출증빙용</b>으로, 아래 <b>본사 사업자번호</b>에 <b>{won(s.payAmount)}</b>을 발급해 주세요.
        </p>
        <CopyRow
          label="본사 사업자등록번호"
          value={hq.businessNumber ? formatBusinessNumber(hq.businessNumber.replace(/\D/g, "")) : null}
        />
        <CopyRow label="금액" value={String(s.payAmount)} />
      </div>
      <div style={ui.card}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={ui.label}>승인번호</span>
          <input
            style={ui.input}
            inputMode="numeric"
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="현금영수증 승인번호"
          />
        </label>
        <label style={{ display: "block" }}>
          <span style={ui.label}>발급일</span>
          <input type="date" style={ui.input} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
        </label>
      </div>
      <PhotoPicker
        label="영수증 사진 (선택)"
        photos={photos}
        max={2}
        busy={compressing || busy}
        onAdd={add}
        onRemove={remove}
      />
      {error ? <p style={ui.errorText}>{error}</p> : null}
      <button
        type="button"
        style={ui.primaryButton(busy || compressing || !ready)}
        disabled={busy || compressing || !ready}
        onClick={submit}
      >
        {busy ? "등록 중…" : "현금영수증 등록"}
      </button>
    </>
  );
}

function Notice({ tone, title, children }: { tone: "ok" | "info" | "warn" | "error"; title: string; children: ReactNode }) {
  const c = {
    ok: { bg: "#ecfdf5", border: "#a7f3d0", color: "#065f46" },
    info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
    warn: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },
    error: { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  }[tone];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const lineRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  padding: "6px 0",
  borderTop: "1px solid #f4f4f5",
};
const backLink: CSSProperties = { display: "inline-block", fontSize: 14, color: "#52525b", textDecoration: "none", marginBottom: 8 };
const inlineLink: CSSProperties = { display: "block", marginTop: 6, fontWeight: 700, color: "inherit" };
const lateBox: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 10,
  padding: 12,
  margin: "0 0 10px",
  wordBreak: "keep-all",
};
const linkBtn: CSSProperties = {
  ...ui.secondaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  boxSizing: "border-box",
};
const hint: CSSProperties = { fontSize: 13, color: "#52525b", lineHeight: 1.6, marginTop: 8, wordBreak: "keep-all" };
const discontinue: CSSProperties = { margin: "8px 0 0", fontWeight: 700, color: "#b42318" };
const copyRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px solid #f4f4f5",
};
const copyBtn: CSSProperties = {
  flexShrink: 0,
  minWidth: 56,
  minHeight: 36,
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  background: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
