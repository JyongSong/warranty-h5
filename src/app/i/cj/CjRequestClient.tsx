"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Script from "next/script";
import {
  formatKrPhone,
  isKoreanMobileNumber,
  isSafeVirtualNumber,
  normalizePhone,
} from "@/lib/phone";
import {
  NOT_MOBILE_MESSAGE,
  SAFE_NUMBER_MESSAGE,
} from "@/lib/installation/customer/error-message";
import {
  INSTALL_DATE_MAX_DAYS_AHEAD,
  INSTALL_DATE_MIN_DAYS_AHEAD,
} from "@/lib/installation/customer/timing";
import { checkCjOrderNoAction, submitCjRequestAction } from "./actions";

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

const SCHEDULE_ADJUST_NOTICE = "설치 날짜와 시간은 기사님 일정에 따라 조정될 수 있습니다.";
const CJ_SUPPORT_NOTICE =
  "주문번호 확인이나 인증번호 수신에 문제가 있으시면 CJ 고객센터로 문의해 주세요.";

const OTP_RESEND_SECONDS = 180;

export type PrivacyPolicy = {
  title: string;
  purpose: string;
  items: string;
  retention: string;
  thirdParty: string;
  refusal: string;
};

type Props = {
  initialToday: string;
  privacyPolicy: PrivacyPolicy;
};

type OrderNoState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; orderDate: string | null }
  | { status: "error"; message: string };

type OtpState = "idle" | "sending" | "sent" | "verifying" | "verified";

export default function CjRequestClient({ initialToday, privacyPolicy }: Props) {
  const [orderNo, setOrderNo] = useState("");
  const [orderNoState, setOrderNoState] = useState<OrderNoState>({ status: "idle" });

  const [ordererPhone, setOrdererPhone] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [verifiedToken, setVerifiedToken] = useState("");

  const [customerPhone, setCustomerPhone] = useState("");

  const [zonecode, setZonecode] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");

  const [installDate, setInstallDate] = useState("");
  const [timeSlot, setTimeSlot] = useState<(typeof TIME_SLOTS)[number] | "">("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const detailInputRef = useRef<HTMLInputElement>(null);

  const dateBounds = useMemo(() => getDateBounds(initialToday), [initialToday]);

  useEffect(() => {
    if (otpSecondsLeft <= 0) return;
    const timer = setTimeout(() => setOtpSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpSecondsLeft]);

  const ordererPhoneNormalized = normalizePhone(ordererPhone);
  const customerPhoneNormalized = normalizePhone(customerPhone);

  const customerPhoneError = getPhoneError(customerPhoneNormalized);
  const ordererPhoneError = getPhoneError(ordererPhoneNormalized);

  const canRequestOtp =
    !ordererPhoneError && ordererPhoneNormalized.length > 0 && otpSecondsLeft === 0;

  const completedCount = [
    orderNoState.status === "ok",
    otpState === "verified",
    customerPhoneNormalized.length > 0 && !customerPhoneError,
    address.trim().length > 0 && addressDetail.trim().length > 0,
    installDate.length > 0,
    timeSlot.length > 0,
    agreed,
  ].filter(Boolean).length;

  const canSubmit = completedCount === 7 && !submitting;

  // 인증 후 번호를 고치면 인증이 무효가 된다. 서버도 토큰과 번호가 같은지 다시
  // 확인하지만, 사용자가 "인증 완료" 표시를 보고 오해하지 않도록 입력 시점에
  // 상태를 되돌린다.
  function handleOrdererPhoneChange(value: string) {
    setOrdererPhone(formatKrPhone(value));
    if (otpState === "verified") {
      setOtpState("idle");
      setVerifiedToken("");
      setOtpCode("");
      setOtpMessage(null);
    }
  }

  async function handleCheckOrderNo() {
    const value = orderNo.trim();
    if (!value) return;

    setOrderNoState({ status: "checking" });
    const result = await checkCjOrderNoAction(value);

    setOrderNoState(
      result.ok
        ? { status: "ok", orderDate: result.orderDate }
        : { status: "error", message: result.message },
    );
  }

  async function handleSendOtp() {
    if (!canRequestOtp) return;

    setOtpState("sending");
    setOtpMessage(null);

    try {
      const response = await fetch("/api/installation/cj/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: ordererPhoneNormalized }),
      });
      const data = await response.json();

      if (!response.ok) {
        setOtpState("idle");
        setOtpMessage({ text: data?.message ?? "인증번호 발송에 실패했습니다.", isError: true });
        return;
      }

      setOtpState("sent");
      setOtpCode("");
      setOtpSecondsLeft(OTP_RESEND_SECONDS);
      setOtpMessage({ text: "인증번호가 발송되었습니다.", isError: false });
    } catch {
      setOtpState("idle");
      setOtpMessage({ text: "인증번호 발송에 실패했습니다.", isError: true });
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.trim().length !== 6) return;

    setOtpState("verifying");
    setOtpMessage(null);

    try {
      const response = await fetch("/api/installation/cj/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          phone: ordererPhoneNormalized,
          code: otpCode.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.verifiedToken) {
        setOtpState("sent");
        setOtpMessage({ text: data?.message ?? "인증에 실패했습니다.", isError: true });
        return;
      }

      setVerifiedToken(data.verifiedToken);
      setOtpState("verified");
      setOtpSecondsLeft(0);
      setOtpMessage({ text: "인증이 완료되었습니다.", isError: false });
    } catch {
      setOtpState("sent");
      setOtpMessage({ text: "인증에 실패했습니다.", isError: true });
    }
  }

  function openPostcode() {
    if (!window.daum) return;

    new window.daum.Postcode({
      oncomplete: (data) => {
        setZonecode(data.zonecode);
        setAddress(data.address);
        setAddressDetail("");
        // 주소를 고른 직후 상세 주소로 넘겨준다. 동·호수를 빠뜨려 제출이
        // 막히는 것이 이 폼에서 가장 흔한 실패였다.
        setTimeout(() => detailInputRef.current?.focus(), 0);
      },
    }).open();
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);

    const result = await submitCjRequestAction({
      orderNo: orderNo.trim(),
      ordererPhone: ordererPhoneNormalized,
      ordererVerifiedToken: verifiedToken,
      customerPhone: customerPhoneNormalized,
      zonecode,
      address,
      addressDetail: addressDetail.trim(),
      installDate,
      installTimeSlot: timeSlot || null,
      customerNote: note.trim() || null,
    });

    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.message);
      // 주문번호가 그 사이 소진됐거나 인증이 만료된 경우 해당 단계를 되돌린다.
      if (result.error === "CJ_ORDER_NO_ALREADY_USED" || result.error === "CJ_ORDER_NO_NOT_FOUND") {
        setOrderNoState({ status: "error", message: result.message });
      }
      if (
        ["PHONE_NOT_VERIFIED", "VERIFICATION_EXPIRED", "VERIFIED_PHONE_MISMATCH"].includes(
          result.error,
        )
      ) {
        setOtpState("idle");
        setVerifiedToken("");
      }
      return;
    }

    setSubmittedAt(installDate);
  }

  if (submittedAt) {
    return (
      <Shell>
        <div style={successCardStyle}>
          <div style={successIconStyle}>✓</div>
          <h1 style={successTitleStyle}>설치 정보가 접수되었습니다</h1>
          <p style={successBodyStyle}>
            입력하신 주소와 희망 일정으로 담당 기사 배정을 진행합니다. 배정이 완료되면
            주문자 번호로 안내 문자를 보내드립니다.
          </p>
          <div style={successSummaryStyle}>
            <SummaryRow label="주문번호" value={orderNo.trim()} />
            <SummaryRow label="설치 주소" value={`${address} ${addressDetail}`.trim()} />
            <SummaryRow label="설치 희망일" value={`${formatDateLabel(submittedAt)} · ${timeSlot}`} />
            <SummaryRow label="설치 받으실 분" value={formatKrPhone(customerPhoneNormalized)} />
          </div>
          <p style={successNoticeStyle}>{SCHEDULE_ADJUST_NOTICE}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="afterInteractive" />

      <header style={headerStyle}>
        <div style={headerTopStyle}>
          <div>
            <p style={eyebrowStyle}>INSTALLATION REQUEST</p>
            <h1 style={pageTitleStyle}>설치 정보 등록</h1>
          </div>
          <span style={counterBadgeStyle}>{completedCount}/7 항목 완료</span>
        </div>
        <p style={pageSubtitleStyle}>표시된 모든 항목을 빠짐없이 입력해주세요.</p>
      </header>

      <div style={dividerStyle} />

      <Field number="01" label="주문번호" required hint="CJ 온스타일 주문번호를 입력한 뒤 확인을 눌러주세요.">
        <div style={inlineRowStyle}>
          <input
            style={{
              ...inputStyle,
              ...(orderNoState.status === "ok" ? inputSuccessStyle : {}),
              ...(orderNoState.status === "error" ? inputErrorStyle : {}),
            }}
            placeholder="예: 20260620034905"
            value={orderNo}
            inputMode="text"
            autoComplete="off"
            onChange={(event) => {
              setOrderNo(event.target.value);
              setOrderNoState({ status: "idle" });
            }}
          />
          <button
            type="button"
            onClick={handleCheckOrderNo}
            disabled={!orderNo.trim() || orderNoState.status === "checking"}
            style={secondaryButtonStyle(!orderNo.trim() || orderNoState.status === "checking")}
          >
            {orderNoState.status === "checking" ? "확인 중" : "확인"}
          </button>
        </div>
        {orderNoState.status === "ok" ? (
          <p style={successTextStyle}>
            주문이 확인되었습니다.
            {orderNoState.orderDate ? ` (주문일 ${formatDateLabel(orderNoState.orderDate)})` : ""}
          </p>
        ) : null}
        {orderNoState.status === "error" ? <p style={errorTextStyle}>{orderNoState.message}</p> : null}
      </Field>

      <Field
        number="02"
        label="주문자 휴대폰 번호"
        required
        hint="주문하신 분의 번호입니다. 배정 결과를 이 번호로 안내드립니다."
      >
        <div style={inlineRowStyle}>
          <input
            style={{
              ...inputStyle,
              ...(otpState === "verified" ? inputSuccessStyle : {}),
              ...(ordererPhoneError ? inputErrorStyle : {}),
            }}
            placeholder="010-0000-0000"
            value={ordererPhone}
            inputMode="tel"
            autoComplete="tel"
            onChange={(event) => handleOrdererPhoneChange(event.target.value)}
          />
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={!canRequestOtp || otpState === "sending" || otpState === "verified"}
            style={secondaryButtonStyle(
              !canRequestOtp || otpState === "sending" || otpState === "verified",
            )}
          >
            {otpState === "verified"
              ? "인증 완료"
              : otpState === "sending"
                ? "전송 중"
                : otpSecondsLeft > 0
                  ? formatSeconds(otpSecondsLeft)
                  : otpState === "sent"
                    ? "재전송"
                    : "인증번호 받기"}
          </button>
        </div>
        {ordererPhoneError ? <p style={errorTextStyle}>{ordererPhoneError}</p> : null}

        {otpState === "sent" || otpState === "verifying" ? (
          <div style={{ ...inlineRowStyle, marginTop: 8 }}>
            <input
              style={inputStyle}
              placeholder="6자리 인증번호"
              value={otpCode}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={otpCode.trim().length !== 6 || otpState === "verifying"}
              style={secondaryButtonStyle(otpCode.trim().length !== 6 || otpState === "verifying")}
            >
              {otpState === "verifying" ? "확인 중" : "확인"}
            </button>
          </div>
        ) : null}

        {otpMessage ? (
          <p style={otpMessage.isError ? errorTextStyle : successTextStyle}>{otpMessage.text}</p>
        ) : null}
      </Field>

      <Field number="03" label="설치 받으실 분 휴대폰 번호" required>
        <input
          style={{ ...inputStyle, ...(customerPhoneError ? inputErrorStyle : {}) }}
          placeholder="010-0000-0000"
          value={customerPhone}
          inputMode="tel"
          onChange={(event) => setCustomerPhone(formatKrPhone(event.target.value))}
        />
        {customerPhoneError ? <p style={errorTextStyle}>{customerPhoneError}</p> : null}
        <p style={hintStyle}>
          설치 당일 현장에 계실 분의 번호입니다. 기사님이 이 번호로 연락드립니다.
        </p>
        <button
          type="button"
          style={linkButtonStyle}
          onClick={() => setCustomerPhone(formatKrPhone(ordererPhone))}
          disabled={!ordererPhone.trim()}
        >
          주문자 번호와 동일
        </button>
      </Field>

      <Field number="04" label="실제 설치 주소" required>
        <div style={inlineRowStyle}>
          <input style={inputStyle} placeholder="우편번호" value={zonecode} readOnly />
          <button type="button" onClick={openPostcode} style={secondaryButtonStyle(false)}>
            우편번호 찾기
          </button>
        </div>
        <input
          style={{ ...inputStyle, marginTop: 8 }}
          placeholder="주소 검색 후 자동으로 입력됩니다"
          value={address}
          readOnly
        />
        <input
          ref={detailInputRef}
          style={{ ...inputStyle, marginTop: 8 }}
          placeholder="동·호수 등 상세주소를 입력해주세요"
          value={addressDetail}
          onChange={(event) => setAddressDetail(event.target.value)}
        />
      </Field>

      <Field
        number="05"
        label="설치 희망일"
        required
        hint={`오늘 기준 ${INSTALL_DATE_MIN_DAYS_AHEAD}일 뒤부터 ${INSTALL_DATE_MAX_DAYS_AHEAD}일 뒤까지 선택할 수 있습니다.`}
      >
        <Calendar
          value={installDate}
          minDate={dateBounds.min}
          maxDate={dateBounds.max}
          onSelect={setInstallDate}
        />
      </Field>

      <Field number="06" label="희망 시간대" required>
        <div style={slotGridStyle}>
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setTimeSlot(slot)}
              style={slotButtonStyle(timeSlot === slot)}
            >
              {slot}
            </button>
          ))}
        </div>
        <p style={hintStyle}>{SCHEDULE_ADJUST_NOTICE}</p>
      </Field>

      <Field number="07" label="요청사항" hint="현관문 종류, 주차 안내 등 미리 알려주실 내용이 있다면 적어주세요.">
        <textarea
          style={textareaStyle}
          rows={3}
          maxLength={500}
          placeholder="예) 도어락이 철문이에요 / 오후에는 부재중입니다"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <section style={consentSectionStyle}>
        <label style={consentLabelStyle}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            style={checkboxStyle}
          />
          <span>
            <strong style={requiredMarkStyle}>[필수]</strong> {privacyPolicy.title}
          </span>
        </label>
        <dl style={consentTableStyle}>
          <ConsentRow label="수집·이용 목적" value={privacyPolicy.purpose} />
          <ConsentRow label="수집 항목" value={privacyPolicy.items} />
          <ConsentRow label="보유·이용 기간" value={privacyPolicy.retention} />
          <ConsentRow label="제3자 제공" value={privacyPolicy.thirdParty} />
          <ConsentRow label="거부 권리" value={privacyPolicy.refusal} />
        </dl>
      </section>

      {submitError ? <p style={submitErrorStyle}>{submitError}</p> : null}

      <button type="button" onClick={handleSubmit} disabled={!canSubmit} style={submitButtonStyle(!canSubmit)}>
        {submitting ? "접수 중..." : "설치 정보 제출"}
      </button>

      <p style={footerNoticeStyle}>{CJ_SUPPORT_NOTICE}</p>
    </Shell>
  );
}

/* ─── 조각 컴포넌트 ─────────────────────────────────────────────────────── */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <BrandMark />
        {children}
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div style={brandStyle}>
      <div style={brandIconStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8l8.6 8.6a1 1 0 0 1 0 1.8Z"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="1.4" fill="#fff" />
        </svg>
      </div>
      <div>
        <p style={brandTitleStyle}>Aqara × CJ Onstyle × 다살림</p>
        <p style={brandSubtitleStyle}>DOORLOCK INSTALL</p>
      </div>
    </div>
  );
}

function Field({
  number,
  label,
  required,
  hint,
  children,
}: {
  number: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section style={fieldStyle}>
      <div style={fieldHeadStyle}>
        <span style={fieldNumberStyle}>{number}</span>
        <span style={fieldLabelStyle}>{label}</span>
        {required ? <span style={requiredBadgeStyle}>필수</span> : <span style={optionalBadgeStyle}>선택</span>}
      </div>
      {children}
      {hint ? <p style={hintStyle}>{hint}</p> : null}
    </section>
  );
}

function ConsentRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={consentRowStyle}>
      <dt style={consentTermStyle}>{label}</dt>
      <dd style={consentDescStyle}>{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryRowStyle}>
      <span style={summaryLabelStyle}>{label}</span>
      <span style={summaryValueStyle}>{value}</span>
    </div>
  );
}

function Calendar({
  value,
  minDate,
  maxDate,
  onSelect,
}: {
  value: string;
  minDate: string;
  maxDate: string;
  onSelect: (date: string) => void;
}) {
  const [cursor, setCursor] = useState(() => value || minDate);
  const cursorDate = new Date(`${cursor}T00:00:00Z`);
  const year = cursorDate.getUTCFullYear();
  const month = cursorDate.getUTCMonth();

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => toYmd(year, month, index + 1)),
  ];

  const canGoPrev = toYmd(year, month, 1) > minDate;
  const canGoNext = toYmd(year, month + 1, 1) <= maxDate;

  return (
    <div style={calendarStyle}>
      <div style={calendarHeadStyle}>
        <button
          type="button"
          style={calendarNavStyle(!canGoPrev)}
          disabled={!canGoPrev}
          onClick={() => setCursor(toYmd(year, month - 1, 1))}
          aria-label="이전 달"
        >
          ‹
        </button>
        <span style={calendarTitleStyle}>
          {year}년 {month + 1}월
        </span>
        <button
          type="button"
          style={calendarNavStyle(!canGoNext)}
          disabled={!canGoNext}
          onClick={() => setCursor(toYmd(year, month + 1, 1))}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div style={calendarGridStyle}>
        {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
          <span key={label} style={calendarWeekdayStyle}>
            {label}
          </span>
        ))}
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />;

          const disabled = date < minDate || date > maxDate;
          const selected = date === value;

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              style={calendarDayStyle(disabled, selected)}
            >
              {Number(date.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 헬퍼 ──────────────────────────────────────────────────────────────── */

function getPhoneError(normalized: string) {
  if (!normalized) return null;
  if (normalized.length < 10) return null;
  if (isSafeVirtualNumber(normalized)) return SAFE_NUMBER_MESSAGE;
  if (!isKoreanMobileNumber(normalized)) return NOT_MOBILE_MESSAGE;
  return null;
}

function getDateBounds(today: string) {
  const base = new Date(`${today}T00:00:00Z`);
  return {
    min: shiftYmd(base, INSTALL_DATE_MIN_DAYS_AHEAD),
    max: shiftYmd(base, INSTALL_DATE_MAX_DAYS_AHEAD),
  };
}

function shiftYmd(base: Date, days: number) {
  const next = new Date(base.getTime() + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

function toYmd(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function formatDateLabel(ymd: string) {
  const date = new Date(`${ymd}T00:00:00Z`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${weekday})`;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/* ─── 스타일 ────────────────────────────────────────────────────────────── */

const PURPLE = "#7C3AED";
const PURPLE_SOFT = "#F3EEFF";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const DANGER = "#DC2626";
const SUCCESS = "#059669";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#FFFFFF",
  color: TEXT,
  fontFamily:
    "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  padding: "24px 16px 64px",
};

const containerStyle: CSSProperties = {
  maxWidth: 660,
  margin: "0 auto",
};

const brandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 32,
};

const brandIconStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  background: PURPLE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const brandTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "-0.01em",
};

const brandSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: MUTED,
};

const headerStyle: CSSProperties = { marginBottom: 24 };

const headerTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: PURPLE,
};

const pageTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

const pageSubtitleStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: MUTED,
};

const counterBadgeStyle: CSSProperties = {
  flexShrink: 0,
  padding: "7px 14px",
  borderRadius: 999,
  background: PURPLE_SOFT,
  color: PURPLE,
  fontSize: 12,
  fontWeight: 600,
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: BORDER,
  margin: "0 0 32px",
};

const fieldStyle: CSSProperties = { marginBottom: 28 };

const fieldHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

const fieldNumberStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: PURPLE,
  letterSpacing: "0.04em",
};

const fieldLabelStyle: CSSProperties = { fontSize: 15, fontWeight: 600 };

const requiredBadgeStyle: CSSProperties = {
  padding: "2px 7px",
  borderRadius: 5,
  background: PURPLE_SOFT,
  color: PURPLE,
  fontSize: 10,
  fontWeight: 700,
};

const optionalBadgeStyle: CSSProperties = {
  padding: "2px 7px",
  borderRadius: 5,
  background: "#F3F4F6",
  color: MUTED,
  fontSize: 10,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  fontSize: 15,
  color: TEXT,
  outline: "none",
  background: "#FFFFFF",
  boxSizing: "border-box",
};

const inputErrorStyle: CSSProperties = { borderColor: DANGER };
const inputSuccessStyle: CSSProperties = { borderColor: SUCCESS };

const inlineRowStyle: CSSProperties = { display: "flex", gap: 8 };

function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    minWidth: 108,
    padding: "14px 16px",
    borderRadius: 10,
    border: `1px solid ${disabled ? BORDER : PURPLE}`,
    background: "#FFFFFF",
    color: disabled ? "#9CA3AF" : PURPLE,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const linkButtonStyle: CSSProperties = {
  marginTop: 8,
  padding: 0,
  border: "none",
  background: "none",
  color: PURPLE,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
};

const hintStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  color: MUTED,
  lineHeight: 1.5,
};

const errorTextStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  color: DANGER,
  lineHeight: 1.5,
};

const successTextStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  color: SUCCESS,
  fontWeight: 600,
};

const calendarStyle: CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 16,
};

const calendarHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const calendarTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 700 };

function calendarNavStyle(disabled: boolean): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "none",
    color: disabled ? "#D1D5DB" : TEXT,
    fontSize: 20,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const calendarGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 2,
  textAlign: "center",
};

const calendarWeekdayStyle: CSSProperties = {
  padding: "8px 0",
  fontSize: 11,
  fontWeight: 600,
  color: MUTED,
};

function calendarDayStyle(disabled: boolean, selected: boolean): CSSProperties {
  return {
    height: 40,
    border: "none",
    borderRadius: 8,
    background: selected ? PURPLE : "transparent",
    color: selected ? "#FFFFFF" : disabled ? "#D1D5DB" : TEXT,
    fontSize: 13,
    fontWeight: selected ? 700 : 500,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const slotGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 8,
};

function slotButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "14px 12px",
    borderRadius: 10,
    border: `1px solid ${selected ? PURPLE : BORDER}`,
    background: selected ? PURPLE_SOFT : "#FFFFFF",
    color: selected ? PURPLE : TEXT,
    fontSize: 14,
    fontWeight: selected ? 700 : 500,
    cursor: "pointer",
  };
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.6,
  fontFamily: "inherit",
};

const consentSectionStyle: CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 24,
};

const consentLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const checkboxStyle: CSSProperties = {
  width: 18,
  height: 18,
  accentColor: PURPLE,
  cursor: "pointer",
  flexShrink: 0,
};

const requiredMarkStyle: CSSProperties = { color: PURPLE };

const consentTableStyle: CSSProperties = {
  margin: "14px 0 0",
  paddingTop: 14,
  borderTop: `1px solid ${BORDER}`,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const consentRowStyle: CSSProperties = { display: "flex", gap: 12 };

const consentTermStyle: CSSProperties = {
  flexShrink: 0,
  width: 96,
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  color: MUTED,
};

const consentDescStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: TEXT,
  lineHeight: 1.6,
};

const submitErrorStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: "12px 14px",
  borderRadius: 10,
  background: "#FEF2F2",
  color: DANGER,
  fontSize: 13,
  lineHeight: 1.6,
};

function submitButtonStyle(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "17px 20px",
    borderRadius: 12,
    border: "none",
    background: disabled ? "#E5E7EB" : PURPLE,
    color: disabled ? "#9CA3AF" : "#FFFFFF",
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const footerNoticeStyle: CSSProperties = {
  margin: "16px 0 0",
  fontSize: 12,
  color: MUTED,
  textAlign: "center",
  lineHeight: 1.6,
};

const successCardStyle: CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  padding: 28,
  textAlign: "center",
};

const successIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  margin: "0 auto 18px",
  borderRadius: "50%",
  background: PURPLE_SOFT,
  color: PURPLE,
  fontSize: 26,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const successTitleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 21,
  fontWeight: 700,
};

const successBodyStyle: CSSProperties = {
  margin: "0 0 22px",
  fontSize: 14,
  color: MUTED,
  lineHeight: 1.7,
};

const successSummaryStyle: CSSProperties = {
  textAlign: "left",
  borderTop: `1px solid ${BORDER}`,
  paddingTop: 18,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const summaryRowStyle: CSSProperties = { display: "flex", gap: 12 };

const summaryLabelStyle: CSSProperties = {
  flexShrink: 0,
  width: 96,
  fontSize: 12,
  fontWeight: 600,
  color: MUTED,
};

const summaryValueStyle: CSSProperties = { fontSize: 13, lineHeight: 1.6 };

const successNoticeStyle: CSSProperties = {
  margin: "20px 0 0",
  fontSize: 12,
  color: MUTED,
};
