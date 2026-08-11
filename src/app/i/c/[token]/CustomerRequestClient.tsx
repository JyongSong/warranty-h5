"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Script from "next/script";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { submitCustomerRequestAction } from "./actions";
import {
  CUSTOMER_REQUEST_UNAVAILABLE_STATUS,
  formatOrderProductSummary,
  getInitialCustomerInputValues,
  getSubmittedStatusScreenContent,
  isCustomerRequestUnavailableError,
} from "./customer-input";

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: {
        oncomplete: (data: { zonecode: string; address: string }) => void;
      }) => { open: () => void };
    };
  }
}

const TIME_SLOTS = [
  "오전 09:00 - 12:00",
  "오후 12:00 - 15:00",
  "오후 15:00 - 18:00",
  "상담 후 조율",
] as const;

type Props = {
  token: string;
  initialInfo: ApiInfo | null;
  initialError: string | null;
  initialAccessBlocked: boolean;
  initialToday: string;
  privacyPolicy: PrivacyPolicy;
};

type RequestInfo = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  installAddress: string | null;
  installDate: string | null;
  customerNote: string | null;
  installationOrder: {
    sourceErpOrderNo: string;
    sourceMemo: string | null;
    sourceCustomerName: string | null;
    sourcePhone: string | null;
    sourceAddress: string | null;
  };
};

export type ApiInfo = {
  status: "VALID" | "EXPIRED" | "SUBMITTED" | "CANCELLED";
  request: RequestInfo;
};

type Summary = {
  fullAddress: string;
  installDate: string;
  timeSlot: string;
  normalizedPhone: string;
  customerNote: string;
};

type PrivacyPolicy = {
  title: string;
  content: string;
};

const FONT_SIZE = {
  pageTitle: 24,
  modalTitle: 22,
  body: 16,
  control: 16,
  helper: 14,
} as const;

const CONTROL_HEIGHT = 56;
const CONTROL_RADIUS = 12;
const TEXT_COLOR = "#18181b";
const PRIMARY_COLOR = "#111";
const BORDER_COLOR = "#ddd";

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function CustomerRequestClient({
  token,
  initialInfo,
  initialError,
  initialAccessBlocked,
  initialToday,
  privacyPolicy,
}: Props) {
  const request = initialInfo?.request ?? null;
  const minDate = useMemo(() => addDays(initialToday, 2), [initialToday]);
  const maxDate = useMemo(() => addDays(initialToday, 30), [initialToday]);
  const [info, setInfo] = useState<ApiInfo | null>(initialInfo);
  const initialInputValues = getInitialCustomerInputValues(request, initialInfo?.status ?? null);
  const [zonecode, setZonecode] = useState("");
  const [address, setAddress] = useState(initialInputValues.address);
  const [addressDetail, setAddressDetail] = useState("");
  const [installDate, setInstallDate] = useState(request?.installDate ?? "");
  const [timeSlot, setTimeSlot] = useState<(typeof TIME_SLOTS)[number] | "">(
    "",
  );
  const [phone, setPhone] = useState(initialInputValues.phone);
  const [customerNote, setCustomerNote] = useState(request?.customerNote ?? "");
  const [consent, setConsent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const normalizedPhone = normalizePhone(phone);
  const fullAddress = [zonecode, address, addressDetail.trim()].filter(Boolean).join(" ");
  const canSubmit =
    info?.status === "VALID" &&
    address.trim().length >= 5 &&
    addressDetail.trim().length > 0 &&
    installDate.length === 10 &&
    timeSlot.length > 0 &&
    normalizedPhone.length >= 9 &&
    consent &&
    !submitting;

  const summary: Summary = {
    fullAddress,
    installDate,
    timeSlot,
    normalizedPhone,
    customerNote,
  };
  const submittedStatusScreen = getSubmittedStatusScreenContent({
    justSubmitted: submitted,
    serverStatus: info?.status ?? null,
  });

  function openPostcode() {
    if (!window.daum) return;
    new window.daum.Postcode({
      oncomplete(data) {
        setZonecode(data.zonecode);
        setAddress(data.address);
      },
    }).open();
  }

  async function confirmSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitCustomerRequestAction({
        token,
        zonecode,
        address,
        addressDetail,
        installDate,
        installTimeSlot: timeSlot,
        customerPhone: normalizedPhone,
        customerNote,
      });

      if (!result.ok) {
        if (isCustomerRequestUnavailableError(result.error)) {
          setConfirmOpen(false);
          setInfo((prev) => (prev ? { ...prev, status: "CANCELLED" } : prev));
          return;
        }
        throw new Error(result.message);
      }

      setConfirmOpen(false);
      setSubmitted(true);
      setInfo((prev) => (prev ? { ...prev, status: "SUBMITTED" } : prev));
    } catch (err) {
      setConfirmOpen(false);
      setError(getErrorMessage(err, "제출할 수 없습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  if (initialAccessBlocked || info?.status === "EXPIRED" || info?.status === "CANCELLED") {
    return (
      <StatusScreen
        title={CUSTOMER_REQUEST_UNAVAILABLE_STATUS.title}
        description={CUSTOMER_REQUEST_UNAVAILABLE_STATUS.description}
        tone="warning"
      />
    );
  }

  if (submittedStatusScreen) {
    return (
      <StatusScreen
        title={submittedStatusScreen.title}
        description={submittedStatusScreen.description}
        summary={submittedStatusScreen.showSummary ? summary : undefined}
        tone={submittedStatusScreen.tone}
      />
    );
  }

  return (
    <>
      <Script
        src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="lazyOnload"
      />

      <PageShell>
        <h1 style={titleStyle}>설치 예약 정보 입력</h1>
        <p style={descriptionStyle}>제품 설치를 위해 아래 정보를 입력해 주세요.</p>

        {request ? <OrderInfoSection request={request} /> : null}

        <div style={formGridStyle}>
          <AddressField
            zonecode={zonecode}
            address={address}
            addressDetail={addressDetail}
            onOpenPostcode={openPostcode}
            onAddressDetailChange={setAddressDetail}
          />

          <label style={fieldGapStyle}>
            <span style={labelStyle}>
              설치 희망 날짜 <span style={requiredStyle}>(필수)</span>
            </span>
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={installDate}
              onChange={(event) => setInstallDate(event.target.value)}
              style={inputStyle}
            />
            <span style={helperTextStyle}>
              모레부터 30일 이내 날짜를 선택해 주세요.
            </span>
          </label>

          <label style={fieldGapStyle}>
            <span style={labelStyle}>
              설치 희망 시간 <span style={requiredStyle}>(필수)</span>
            </span>
            <select
              value={timeSlot}
              onChange={(event) =>
                setTimeSlot(event.target.value as (typeof TIME_SLOTS)[number] | "")
              }
              style={inputStyle}
            >
              <option value="">시간대를 선택해 주세요</option>
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldGapStyle}>
            <span style={labelStyle}>
              고객 연락처 <span style={requiredStyle}>(필수)</span>
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="010-1234-5678"
              style={inputStyle}
            />
          </label>

          <label style={fieldGapStyle}>
            <span style={labelStyle}>요청사항</span>
            <textarea
              value={customerNote}
              onChange={(event) => setCustomerNote(event.target.value)}
              rows={4}
              placeholder="방문 가능 시간, 공동현관 안내 등"
              style={textareaStyle}
            />
          </label>

          <label style={consentStyle}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              style={checkboxStyle}
            />
            <span>
              <button
                type="button"
                onClick={() => setPrivacyOpen(true)}
                style={privacyButtonStyle}
              >
                개인정보 수집 및 이용
              </button>
              에 동의합니다. <strong style={requiredStyle}>(필수)</strong>
            </span>
          </label>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            style={submitButtonStyle(!canSubmit)}
          >
            {submitting ? "제출 중..." : "예약 정보 접수"}
          </button>
        </div>
      </PageShell>

      {confirmOpen ? (
        <ConfirmReservationModal
          summary={summary}
          submitting={submitting}
          onEdit={() => setConfirmOpen(false)}
          onConfirm={confirmSubmit}
        />
      ) : null}

      {privacyOpen ? (
        <PrivacyPolicyModal
          privacyPolicy={privacyPolicy}
          onClose={() => setPrivacyOpen(false)}
        />
      ) : null}

      {error ? (
        <ErrorNoticeModal message={error} onClose={() => setError(null)} />
      ) : null}
    </>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main style={pageStyle}>
      <section style={panelStyle}>{children}</section>
    </main>
  );
}

function StatusScreen({
  title,
  description,
  summary,
  tone,
}: {
  title: string;
  description: string | readonly string[];
  summary?: Summary;
  tone: "success" | "warning" | "error";
}) {
  const descriptionLines = Array.isArray(description) ? description : [description];

  return (
    <PageShell>
      <div style={statusMarkStyle(tone)}>{tone === "success" ? "✓" : "!"}</div>
      <h1 style={titleStyle}>{title}</h1>
      <div style={descriptionStyle}>
        {descriptionLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      {summary ? <SummaryList summary={summary} /> : null}
    </PageShell>
  );
}

function OrderInfoSection({ request }: { request: RequestInfo }) {
  return (
    <section style={orderInfoStyle}>
      {request.installationOrder.sourceMemo ? (
        <SummaryRow
          label="주문 상품"
          value={formatOrderProductSummary(request.installationOrder.sourceMemo)}
        />
      ) : null}
      <SummaryRow label="주문번호" value={request.installationOrder.sourceErpOrderNo} />
    </section>
  );
}

function AddressField({
  zonecode,
  address,
  addressDetail,
  onOpenPostcode,
  onAddressDetailChange,
}: {
  zonecode: string;
  address: string;
  addressDetail: string;
  onOpenPostcode: () => void;
  onAddressDetailChange: (value: string) => void;
}) {
  return (
    <div style={fieldGapStyle}>
      <label style={labelStyle}>
        설치 주소 <span style={requiredStyle}>(필수)</span>
      </label>
      <div style={postcodeRowStyle}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="우편번호" value={zonecode} readOnly />
        <button type="button" onClick={onOpenPostcode} style={postcodeButtonStyle}>
          우편번호 검색
        </button>
      </div>
      <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="기본 주소" value={address} readOnly />
      <input
        style={inputStyle}
        placeholder="상세 주소 입력"
        value={addressDetail}
        onChange={(event) => onAddressDetailChange(event.target.value)}
      />
    </div>
  );
}

function ConfirmReservationModal({
  summary,
  submitting,
  onEdit,
  onConfirm,
}: {
  summary: Summary;
  submitting: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={modalOverlayStyle} role="presentation">
      <div
        style={modalPanelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-confirm-title"
      >
        <h2 id="reservation-confirm-title" style={modalTitleStyle}>
          입력한 정보로 접수할까요?
        </h2>
        <p style={modalDescriptionStyle}>접수 후 담당자가 확인하여 안내드립니다.</p>
        <SummaryList summary={summary} />
        <div style={modalButtonRowStyle}>
          <button type="button" onClick={onEdit} disabled={submitting} style={secondaryButtonStyle}>
            수정하기
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting} style={confirmButtonStyle}>
            {submitting ? "접수 중..." : "접수하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrivacyPolicyModal({
  privacyPolicy,
  onClose,
}: {
  privacyPolicy: PrivacyPolicy;
  onClose: () => void;
}) {
  return (
    <div style={modalOverlayStyle} role="presentation">
      <div
        style={modalPanelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-policy-title"
      >
        <h2 id="privacy-policy-title" style={modalTitleStyle}>
          {privacyPolicy.title}
        </h2>
        <div style={privacyContentStyle}>{privacyPolicy.content}</div>
        <button type="button" onClick={onClose} style={privacyCloseButtonStyle}>
          확인
        </button>
      </div>
    </div>
  );
}

function ErrorNoticeModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div style={modalOverlayStyle} role="presentation">
      <div
        style={modalPanelStyle}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reservation-error-title"
      >
        <div style={statusMarkStyle("error")}>!</div>
        <h2 id="reservation-error-title" style={modalTitleStyle}>
          확인 필요
        </h2>
        <p style={modalDescriptionStyle}>{message}</p>
        <button
          type="button"
          onClick={onClose}
          style={{ ...confirmButtonStyle, width: "100%" }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

function SummaryList({ summary }: { summary: Summary }) {
  return (
    <div style={summaryBoxStyle}>
      <SummaryRow label="설치 주소" value={summary.fullAddress} />
      <SummaryRow label="희망 날짜" value={summary.installDate} />
      <SummaryRow label="희망 시간" value={summary.timeSlot} />
      <SummaryRow label="연락처" value={summary.normalizedPhone} />
      {summary.customerNote ? <SummaryRow label="요청사항" value={summary.customerNote} /> : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryRowStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  color: TEXT_COLOR,
  padding: "32px 16px 40px",
};

const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  margin: "0 auto",
};

const titleStyle: CSSProperties = {
  fontSize: FONT_SIZE.pageTitle,
  fontWeight: 700,
  margin: "0 0 8px",
  letterSpacing: 0,
};

const descriptionStyle: CSSProperties = {
  margin: "0 0 26px",
  color: "rgba(24,24,27,0.7)",
  fontSize: FONT_SIZE.body,
  lineHeight: 1.6,
};

const formGridStyle: CSSProperties = {
  display: "grid",
};

const orderInfoStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 22,
};

const fieldGapStyle: CSSProperties = {
  display: "block",
  marginBottom: 22,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: FONT_SIZE.control,
  fontWeight: 600,
  marginBottom: 8,
};

const requiredStyle: CSSProperties = {
  color: "#e53e3e",
  fontWeight: 700,
};

const helperTextStyle: CSSProperties = {
  display: "block",
  fontSize: FONT_SIZE.helper,
  opacity: 0.6,
  marginTop: 8,
  lineHeight: 1.5,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: CONTROL_HEIGHT,
  padding: "15px 14px",
  borderRadius: CONTROL_RADIUS,
  border: `1px solid ${BORDER_COLOR}`,
  background: "#fff",
  fontSize: FONT_SIZE.control,
  color: PRIMARY_COLOR,
  boxSizing: "border-box",
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 108,
  resize: "vertical",
};

const postcodeRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 8,
};

const postcodeButtonStyle: CSSProperties = {
  minHeight: CONTROL_HEIGHT,
  padding: "12px 14px",
  borderRadius: CONTROL_RADIUS,
  border: `1px solid ${PRIMARY_COLOR}`,
  background: PRIMARY_COLOR,
  color: "#fff",
  fontSize: FONT_SIZE.control,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const consentStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  color: "#27272a",
  fontSize: FONT_SIZE.body,
  lineHeight: 1.55,
  marginBottom: 22,
};

const checkboxStyle: CSSProperties = {
  width: 22,
  height: 22,
  flexShrink: 0,
  marginTop: 2,
};

const privacyButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  padding: 0,
  color: "#1d3129",
  fontWeight: 700,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
  fontSize: "inherit",
};

const privacyContentStyle: CSSProperties = {
  maxHeight: "50vh",
  overflowY: "auto",
  paddingRight: 4,
  fontSize: FONT_SIZE.helper,
  lineHeight: 1.6,
  color: "rgba(24,24,27,0.78)",
  whiteSpace: "pre-wrap",
};

const privacyCloseButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: CONTROL_HEIGHT,
  padding: "16px 14px",
  borderRadius: CONTROL_RADIUS,
  border: "none",
  background: PRIMARY_COLOR,
  color: "#fff",
  fontSize: FONT_SIZE.control,
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 18,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(0,0,0,0.42)",
  zIndex: 50,
};

const modalPanelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  borderRadius: 8,
  background: "#fff",
  padding: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
};

const modalTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: FONT_SIZE.modalTitle,
  fontWeight: 700,
};

const modalDescriptionStyle: CSSProperties = {
  margin: "0 0 16px",
  color: "rgba(24,24,27,0.7)",
  fontSize: FONT_SIZE.body,
  lineHeight: 1.6,
};

const modalButtonRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 14,
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: CONTROL_HEIGHT,
  padding: "16px 14px",
  borderRadius: CONTROL_RADIUS,
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: TEXT_COLOR,
  fontSize: FONT_SIZE.control,
  fontWeight: 700,
  cursor: "pointer",
};

const confirmButtonStyle: CSSProperties = {
  minHeight: CONTROL_HEIGHT,
  padding: "16px 14px",
  borderRadius: CONTROL_RADIUS,
  border: "none",
  background: PRIMARY_COLOR,
  color: "#fff",
  fontSize: FONT_SIZE.control,
  fontWeight: 700,
  cursor: "pointer",
};

const summaryBoxStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 16,
  padding: 14,
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
};

const summaryRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: FONT_SIZE.helper,
  color: "#71717a",
  fontWeight: 700,
};

const summaryValueStyle: CSSProperties = {
  fontSize: FONT_SIZE.control,
  color: TEXT_COLOR,
  fontWeight: 700,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

function submitButtonStyle(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    minHeight: CONTROL_HEIGHT,
    padding: "16px 14px",
    borderRadius: CONTROL_RADIUS,
    border: "none",
    background: disabled ? "#ccc" : PRIMARY_COLOR,
    color: "#fff",
    fontSize: FONT_SIZE.control,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function statusMarkStyle(tone: "success" | "warning" | "error"): CSSProperties {
  const background = {
    success: PRIMARY_COLOR,
    warning: "#8a5600",
    error: "#b42318",
  }[tone];

  return {
    width: 60,
    height: 60,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background,
    color: "#fff",
    fontSize: 32,
    fontWeight: 800,
    marginBottom: 16,
  };
}
