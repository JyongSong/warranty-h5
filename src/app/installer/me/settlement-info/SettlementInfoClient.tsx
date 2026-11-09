"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { compressImage } from "@/lib/installer/image";
import type {
  SettlementInfoView,
  TaxDocType,
} from "@/lib/installer/settlement-info";
import PhotoPicker from "../../PhotoPicker";
import * as ui from "../../ui";
import {
  getDocUploadTargetsAction,
  submitSettlementInfoAction,
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

const DOC_TYPES: Array<{ value: TaxDocType; title: string; desc: string }> = [
  {
    value: "E_TAX_INVOICE",
    title: "전자세금계산서",
    desc: "홈택스·팝빌 등으로 전자세금계산서를 발행할 수 있어요.",
  },
  {
    value: "PAPER_TAX_INVOICE",
    title: "종이 세금계산서",
    desc: "종이 세금계산서를 발행해 원본을 보내 주세요.",
  },
  {
    value: "CASH_RECEIPT",
    title: "현금영수증",
    desc: "간이과세자 등 세금계산서 발행이 어려운 경우. 정산 금액을 받은 뒤 본사 사업자번호로 지출증빙 현금영수증을 발급해 주세요.",
  },
];

const BANKS = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "SC제일은행",
  "새마을금고",
  "신협",
  "우체국",
  "수협은행",
  "부산은행",
  "대구은행(iM뱅크)",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
];

const ERR: Record<string, string> = {
  TAX_DOC_TYPE_INVALID: "증빙 종류를 선택해 주세요.",
  BUSINESS_NUMBER_INVALID: "사업자등록번호 10자리를 정확히 입력해 주세요.",
  BUSINESS_NAME_REQUIRED: "상호를 입력해 주세요.",
  REPRESENTATIVE_REQUIRED: "대표자 이름을 입력해 주세요.",
  EMAIL_INVALID: "이메일 주소 형식이 올바르지 않습니다.",
  EMAIL_REQUIRED: "전자세금계산서를 받을 이메일을 입력해 주세요.",
  BANK_NAME_REQUIRED: "은행을 선택해 주세요.",
  ACCOUNT_NUMBER_INVALID: "계좌번호를 정확히 입력해 주세요.",
  ACCOUNT_HOLDER_REQUIRED: "예금주를 입력해 주세요.",
  PHOTO_REQUIRED: "사업자등록증과 통장 사본 사진을 모두 첨부해 주세요.",
  PHOTO_MISSING: "사진 업로드가 끝나지 않았습니다. 사진을 다시 첨부해 주세요.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

const STATUS_BADGE: Record<
  string,
  { text: string; bg: string; color: string }
> = {
  SUBMITTED: { text: "본사 확인 중", bg: "#fef3c7", color: "#92400e" },
  APPROVED: { text: "승인 완료", bg: "#d1fae5", color: "#065f46" },
  REJECTED: {
    text: "반려 · 다시 제출해 주세요",
    bg: "#fee2e2",
    color: "#991b1b",
  },
};

/**
 * showTaxDocType: 증빙 종류 선택 표시 여부(시스템 설정). 꺼져 있으면 그 카드를 숨기고,
 * 서버도 증빙 종류를 받지 않는다(이전에 저장된 값은 그대로 둔다).
 */
export default function SettlementInfoClient({
  info,
  showTaxDocType,
}: {
  info: SettlementInfoView | null;
  showTaxDocType: boolean;
}) {
  const router = useRouter();
  const [taxDocType, setTaxDocType] = useState<TaxDocType | "">(
    info?.taxDocType ?? "",
  );
  const [businessNumber, setBusinessNumber] = useState(
    formatBizNo(info?.businessNumber ?? ""),
  );
  const [businessName, setBusinessName] = useState(info?.businessName ?? "");
  const [representativeName, setRepresentativeName] = useState(
    info?.representativeName ?? "",
  );
  const [invoiceEmail, setInvoiceEmail] = useState(info?.invoiceEmail ?? "");
  const [bankName, setBankName] = useState(info?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(info?.accountNumber ?? "");
  const [accountHolder, setAccountHolder] = useState(info?.accountHolder ?? "");

  // 이미 올린 사진은 경로를 그대로 다시 제출한다. 새로 고르면 그 파일로 바꾼다.
  const [licenseExisting, setLicenseExisting] = useState(
    info
      ? {
          path: info.businessLicensePhotoPath,
          url: info.businessLicensePhotoUrl,
        }
      : null,
  );
  const [bankbookExisting, setBankbookExisting] = useState(
    info ? { path: info.bankbookPhotoPath, url: info.bankbookPhotoUrl } : null,
  );
  const [licenseFile, setLicenseFile] = useState<File[]>([]);
  const [bankbookFile, setBankbookFile] = useState<File[]>([]);

  const [compressing, setCompressing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasLicense = licenseFile.length > 0 || Boolean(licenseExisting);
  const hasBankbook = bankbookFile.length > 0 || Boolean(bankbookExisting);
  const needsEmail = showTaxDocType && taxDocType === "E_TAX_INVOICE";
  const canSubmit =
    (!showTaxDocType || Boolean(taxDocType)) &&
    businessNumber.replace(/\D/g, "").length === 10 &&
    businessName.trim() !== "" &&
    representativeName.trim() !== "" &&
    bankName.trim() !== "" &&
    accountNumber.replace(/\D/g, "").length >= 8 &&
    accountHolder.trim() !== "" &&
    (!needsEmail || invoiceEmail.trim() !== "") &&
    hasLicense &&
    hasBankbook &&
    !busy &&
    !compressing;

  async function pick(list: FileList | null, set: (files: File[]) => void) {
    if (!list || list.length === 0) return;
    setCompressing(true);
    const compressed = await compressImage(list[0]);
    set([compressed]);
    setCompressing(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const newFiles = [licenseFile[0], bankbookFile[0]].filter(
        (f): f is File => Boolean(f),
      );
      const uploaded: string[] = [];
      if (newFiles.length > 0) {
        const res = await getDocUploadTargetsAction(newFiles.length);
        if (!res.ok) throw new Error(res.error);
        const supabase = getSupabaseBrowser();
        for (let i = 0; i < newFiles.length; i++) {
          const t = res.targets[i];
          const up = await supabase.storage
            .from(res.bucket)
            .uploadToSignedUrl(t.path, t.token, newFiles[i]);
          if (up.error) throw up.error;
          uploaded.push(t.path);
        }
      }
      let next = 0;
      const licensePath = licenseFile[0]
        ? uploaded[next++]
        : (licenseExisting?.path ?? "");
      const bankbookPath = bankbookFile[0]
        ? uploaded[next++]
        : (bankbookExisting?.path ?? "");

      const result = await submitSettlementInfoAction({
        taxDocType,
        businessNumber,
        businessName,
        representativeName,
        invoiceEmail,
        bankName,
        accountNumber,
        accountHolder,
        businessLicensePhotoPath: licensePath,
        bankbookPhotoPath: bankbookPath,
      });
      if (!result.ok) {
        setError(ERR[result.error] ?? ERR.DEFAULT);
        return;
      }
      setDone(true);
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(ERR.DEFAULT);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main style={ui.page}>
        <div style={ui.panel}>
          <h1 style={ui.h1}>제출했습니다</h1>
          <p style={ui.sub}>
            본사에서 확인 후 승인합니다. 반려되면 이 화면에서 사유를 보고 다시
            제출하실 수 있어요.
          </p>
          <Link
            href="/installer/me"
            style={{ ...ui.secondaryButton, ...linkBtn }}
          >
            내 정보로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  const badge = info ? STATUS_BADGE[info.status] : null;

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <h1 style={ui.h1}>정산 정보 등록</h1>
        <p style={ui.sub}>
          {showTaxDocType
            ? "정산금 지급과 증빙(세금계산서·현금영수증)에 쓰는 정보입니다."
            : "정산금 지급에 쓰는 정보입니다."}
        </p>

        {badge ? (
          <div style={ui.card}>
            <span style={ui.badge(badge.bg, badge.color)}>{badge.text}</span>
            {info?.status === "REJECTED" && info.rejectReason ? (
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 14,
                  color: "#991b1b",
                  lineHeight: 1.6,
                }}
              >
                반려 사유: {info.rejectReason}
              </p>
            ) : null}
            {info?.status === "APPROVED" ? (
              <p style={hint}>
                내용을 바꿔 다시 제출하면 본사가 다시 확인합니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {showTaxDocType ? (
          <div style={ui.card}>
            <div style={ui.label}>정산 증빙 종류</div>
            <div style={{ display: "grid", gap: 8 }}>
              {DOC_TYPES.map((t) => {
                const selected = taxDocType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTaxDocType(t.value)}
                    style={{
                      ...optionBtn,
                      ...(selected ? optionSelected : null),
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {selected ? "● " : "○ "}
                      {t.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: selected ? "#d4d4d8" : "#71717a",
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {t.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div style={ui.card}>
          <div style={ui.label}>사업자 정보</div>
          <Field label="사업자등록번호">
            <input
              style={ui.input}
              inputMode="numeric"
              placeholder="000-00-00000"
              value={businessNumber}
              onChange={(e) => setBusinessNumber(formatBizNo(e.target.value))}
            />
          </Field>
          <Field label="상호">
            <input
              style={ui.input}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </Field>
          <Field label="대표자">
            <input
              style={ui.input}
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
            />
          </Field>
          <Field
            label={needsEmail ? "세금계산서 받을 이메일" : "이메일 (선택)"}
          >
            <input
              style={ui.input}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={invoiceEmail}
              onChange={(e) => setInvoiceEmail(e.target.value)}
            />
          </Field>
        </div>

        <div style={ui.card}>
          <div style={ui.label}>정산 받을 계좌</div>
          <Field label="은행">
            <input
              style={ui.input}
              list="installer-bank-list"
              placeholder="은행 선택 또는 입력"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <datalist id="installer-bank-list">
              {BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="계좌번호">
            <input
              style={ui.input}
              inputMode="numeric"
              placeholder="숫자만 입력해도 됩니다"
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/[^\d-]/g, ""))
              }
            />
          </Field>
          <Field label="예금주">
            <input
              style={ui.input}
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
            />
          </Field>
          <p style={hint}>
            예금주는 사업자등록증의 대표자 또는 상호와 같아야 합니다.
          </p>
        </div>

        <DocPhoto
          label="사업자등록증 사진"
          existing={licenseExisting}
          files={licenseFile}
          busy={compressing || busy}
          onAdd={(list) => pick(list, setLicenseFile)}
          onRemove={() => setLicenseFile([])}
          onReplace={() => setLicenseExisting(null)}
        />
        <DocPhoto
          label="통장 사본 사진"
          existing={bankbookExisting}
          files={bankbookFile}
          busy={compressing || busy}
          onAdd={(list) => pick(list, setBankbookFile)}
          onRemove={() => setBankbookFile([])}
          onReplace={() => setBankbookExisting(null)}
        />

        {error ? <p style={ui.errorText}>{error}</p> : null}

        <button
          type="button"
          style={{ ...ui.primaryButton(!canSubmit), marginTop: 8 }}
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? "제출 중…" : info ? "다시 제출" : "제출"}
        </button>
      </div>
    </main>
  );
}

function DocPhoto({
  label,
  existing,
  files,
  busy,
  onAdd,
  onRemove,
  onReplace,
}: {
  label: string;
  existing: { path: string; url: string | null } | null;
  files: File[];
  busy: boolean;
  onAdd: (list: FileList | null) => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  if (existing && files.length === 0) {
    return (
      <div style={ui.card}>
        <div style={ui.label}>{label}</div>
        {existing.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={existing.url} alt={label} style={existingImg} />
        ) : (
          <p style={hint}>등록된 사진을 불러오지 못했습니다.</p>
        )}
        <button
          type="button"
          style={{
            ...ui.secondaryButton,
            marginTop: 10,
            minHeight: 44,
            fontSize: 14,
          }}
          onClick={onReplace}
        >
          사진 바꾸기
        </button>
      </div>
    );
  }
  return (
    <PhotoPicker
      label={label}
      photos={files}
      max={1}
      busy={busy}
      onAdd={onAdd}
      onRemove={onRemove}
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span
        style={{
          display: "block",
          fontSize: 13,
          color: "#52525b",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function formatBizNo(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

const hint: CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  margin: "8px 0 0",
  lineHeight: 1.6,
};

const optionBtn: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: "#18181b",
  cursor: "pointer",
};

const optionSelected: CSSProperties = {
  background: "#111",
  borderColor: "#111",
  color: "#fff",
};

const existingImg: CSSProperties = {
  width: "100%",
  maxHeight: 240,
  objectFit: "contain",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fafafa",
  display: "block",
};

const linkBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};
