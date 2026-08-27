"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getErrorMessage } from "@/lib/error";
import { submitInstallerResponseAction } from "./actions";
import {
  getInitialInstallerResponseStatus,
  INSTALLER_RESPONSE_UNAVAILABLE_STATUS,
  isInstallerResponseUnavailableError,
  isInstallerResponseUnavailableStatus,
  type InstallerResponseStatus,
} from "./installer-response-status";
import { parseProductSummaryItems } from "./product-summary";

type ResponseStatus = InstallerResponseStatus;
type PendingAction = "accept" | "reject" | null;

type StatusHeader = {
  mark: string;
  title: string;
  description: readonly string[];
  tone: "green" | "amber";
};

type DispatchDetail = {
  status: ResponseStatus;
  responseDeadline: string;
  orderNumber: string;
  installDate: string;
  timeWindow: string;
  address: string;
  customerPhone: string;
  // CJ 건에만 있다(주문자 번호). 없으면 빈 문자열.
  backupPhone: string;
  productItems: { name: string; quantity: number }[];
  requiredCapabilities: string[];
  notes: string[];
};

type ResponseConfig = {
  rejectionReasons: string[];
  dispatchNotes: string[];
};

type Props = {
  token: string;
  initialInfo: ApiInfo | null;
  initialError: string | null;
  initialAccessBlocked: boolean;
  responseConfig: ResponseConfig;
};

type AssignmentInfo = {
  id: string;
  installerId: string;
  status: string;
  installerTokenExpiresAt: string | null;
  installationOrder: {
    sourceErpOrderNo: string;
    sourceCustomerName: string | null;
    sourcePhone: string | null;
    productSummary?: string;
    requiredCapabilities?: string[];
    customerRequests: Array<{
      installAddress: string | null;
      installAddressDetail: string | null;
      installDate: string | null;
      installTimeSlot: string | null;
      customerPhone: string | null;
      ordererPhone: string | null;
    }>;
  };
};

export type ApiInfo = {
  status: "VALID" | "EXPIRED" | "RESPONDED" | "CANCELLED";
  assignment: AssignmentInfo;
};

const FONT_SIZE = {
  pageTitle: 24,
  modalTitle: 22,
  sectionTitle: 18,
  body: 16,
  control: 16,
  helper: 14,
} as const;

const CONTROL_HEIGHT = 56;
const CONTROL_RADIUS = 12;
const TEXT_COLOR = "#18181b";
const PRIMARY_COLOR = "#111";
const BORDER_COLOR = "#ddd";

function todayKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  return date ? date.replaceAll("-", ".") : "-";
}

function getDDay(date: string) {
  if (!date) return "";
  const today = new Date(`${todayKST()}T00:00:00+09:00`);
  const target = new Date(`${date}T00:00:00+09:00`);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

function formatResponseDeadline(expiresAt: string | null | undefined) {
  if (!expiresAt) return "문자 수신 후 24시간";

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "문자 수신 후 24시간";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = valueByType.get("year");
  const month = valueByType.get("month");
  const day = valueByType.get("day");
  const hour = valueByType.get("hour");
  const minute = valueByType.get("minute");

  if (!year || !month || !day || !hour || !minute) {
    return "문자 수신 후 24시간";
  }

  const numericHour = Number(hour);
  if (!Number.isFinite(numericHour)) return "문자 수신 후 24시간";

  const dayPeriod = numericHour < 12 ? "오전" : "오후";
  const displayHour = String(numericHour % 12 || 12).padStart(2, "0");

  return `문자 수신 후 24시간 (${year}.${month}.${day} ${dayPeriod} ${displayHour}:${minute})`;
}

function getStatusHeader(status: ResponseStatus): StatusHeader | null {
  if (status === "accepted") {
    return {
      mark: "✓",
      title: "배정을 수락했습니다",
      description: [
        "48시간 이내 고객에게 확인 전화를 진행해 주세요.",
        "설치 시간은 고객과 확인 전화에서 최종 조율할 수 있습니다.",
      ],
      tone: "green",
    };
  }

  if (status === "rejected") {
    return {
      mark: "✓",
      title: "배정을 거절했습니다",
      description: ["선택한 사유는 관리자 이력에 표시되며, 다음 기사에게 배정 요청이 전달됩니다."],
      tone: "green",
    };
  }

  if (status === "expired") {
    return INSTALLER_RESPONSE_UNAVAILABLE_STATUS;
  }

  if (status === "cancelled") {
    return INSTALLER_RESPONSE_UNAVAILABLE_STATUS;
  }

  if (status === "completed") {
    return INSTALLER_RESPONSE_UNAVAILABLE_STATUS;
  }

  return null;
}

function getInitialStatus(initialInfo: ApiInfo | null): ResponseStatus {
  return getInitialInstallerResponseStatus({
    tokenStatus: initialInfo?.status ?? null,
  });
}

function buildDispatchDetail(
  initialInfo: ApiInfo | null,
  responseConfig: ResponseConfig,
): DispatchDetail {
  const assignment = initialInfo?.assignment ?? null;
  const request = assignment?.installationOrder.customerRequests[0] ?? null;

  return {
    status: getInitialStatus(initialInfo),
    responseDeadline: formatResponseDeadline(assignment?.installerTokenExpiresAt),
    orderNumber: assignment?.installationOrder.sourceErpOrderNo ?? "",
    installDate: request?.installDate ?? "",
    timeWindow: request?.installTimeSlot ?? "고객과 확인 전화에서 조율",
    address: formatInstallAddress(request),
    customerPhone: formatPhoneNumber(
      request?.customerPhone ?? assignment?.installationOrder.sourcePhone,
    ),
    // CJ 건은 주문자 번호가 따로 있다. 현장 번호가 안 될 때 본사를 거치지 않고
    // 바로 걸 수 있도록 예비 연락처로 같이 보여 준다.
    backupPhone: request?.ordererPhone ? formatPhoneNumber(request.ordererPhone) : "",
    productItems: parseProductSummaryItems(assignment?.installationOrder.productSummary),
    requiredCapabilities: assignment?.installationOrder.requiredCapabilities ?? [],
    notes: responseConfig.dispatchNotes,
  };
}

function shouldShowDetailSections(status: ResponseStatus) {
  return status !== "rejected" && !isInstallerResponseUnavailableStatus(status);
}

function formatInstallAddress(
  request: AssignmentInfo["installationOrder"]["customerRequests"][number] | null,
) {
  return [request?.installAddress, request?.installAddressDetail]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ") || "-";
}

function formatPhoneNumber(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  if (digits.length === 10) {
    return digits.startsWith("02")
      ? digits.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3")
      : digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  return phone?.trim() || "-";
}

function shouldShowResponseSection(status: ResponseStatus) {
  return status === "pending";
}

export default function InstallerResponseClient({
  token,
  initialInfo,
  initialError,
  initialAccessBlocked,
  responseConfig,
}: Props) {
  const detail = useMemo(
    () => buildDispatchDetail(initialInfo, responseConfig),
    [initialInfo, responseConfig],
  );
  const [status, setStatus] = useState<ResponseStatus>(detail.status);
  const [selectedReason, setSelectedReason] = useState(responseConfig.rejectionReasons[0] ?? "");
  const [customReason, setCustomReason] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const canRespond = status === "pending" && !submitting;
  const canReject = selectedReason.length > 0 && !submitting;
  const statusHeader = initialAccessBlocked
    ? INSTALLER_RESPONSE_UNAVAILABLE_STATUS
    : getStatusHeader(status);

  async function confirmPendingAction() {
    if (!pendingAction || !canRespond) return;
    if (pendingAction === "reject" && !canReject) return;

    setSubmitting(true);
    setError(null);

    const rejectReason =
      selectedReason === "기타" ? customReason.trim() || selectedReason : selectedReason;

    try {
      const result = await submitInstallerResponseAction({
        token,
        response: pendingAction === "accept" ? "ACCEPT" : "REJECT",
        rejectReason: pendingAction === "reject" ? rejectReason : null,
      });

      if (!result.ok) {
        if (isInstallerResponseUnavailableError(result.error)) {
          setStatus("completed");
          setPendingAction(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        throw new Error(result.error);
      }

      setStatus(pendingAction === "accept" ? "accepted" : "rejected");
      setPendingAction(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setPendingAction(null);
      setError(getErrorMessage(err, "응답을 제출할 수 없습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <PageShell>
        <div style={warningMarkStyle}>!</div>
        <h1 style={titleStyle}>확인 필요</h1>
        <p style={descriptionStyle}>{error}</p>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell>
        <Header statusHeader={statusHeader} responseDeadline={detail.responseDeadline} />

        {!initialAccessBlocked && shouldShowDetailSections(status) ? (
          <DispatchDetailSections detail={detail} />
        ) : null}

        {!initialAccessBlocked && shouldShowResponseSection(status) ? (
          <ResponseSection
            canRespond={canRespond}
            onAccept={() => setPendingAction("accept")}
            onReject={() => setPendingAction("reject")}
          />
        ) : null}
      </PageShell>

      {pendingAction ? (
        <ConfirmModal
          action={pendingAction}
          canReject={canReject}
          customReason={customReason}
          notes={
            pendingAction === "accept"
              ? detail.notes.filter((note) => !note.includes("거절"))
              : detail.notes
          }
          onCustomReasonChange={setCustomReason}
          submitting={submitting}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          onSelectReason={setSelectedReason}
          rejectionReasons={responseConfig.rejectionReasons}
          selectedReason={selectedReason}
        />
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

function Header({
  statusHeader,
  responseDeadline,
}: {
  statusHeader: StatusHeader | null;
  responseDeadline: string;
}) {
  if (statusHeader) {
    return (
      <>
        <div style={statusHeader.tone === "green" ? successMarkStyle : warningMarkStyle}>
          {statusHeader.mark}
        </div>
        <h1 style={titleStyle}>{statusHeader.title}</h1>
        <div style={descriptionStyle}>
          {statusHeader.description.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 style={titleStyle}>설치 진행 가능 여부를 선택해 주세요</h1>
      <p style={descriptionStyle}>내용을 확인한 뒤 수락 또는 거절을 선택해 주세요.</p>
      <div style={noticeStyle("blue")}>
        응답 기한은 <strong>{responseDeadline}</strong>까지입니다. 기한 내 미응답 시 자동 거절 처리됩니다.
      </div>
    </>
  );
}

function DispatchDetailSections({ detail }: { detail: DispatchDetail }) {
  const dDay = getDDay(detail.installDate);

  return (
    <>
      <Section title="설치 상세">
        <div style={summaryBoxStyle}>
          <InlineSummaryRow label="주문번호" value={detail.orderNumber || "-"} />
          <InlineSummaryRow
            label="설치일"
            value={`${displayDate(detail.installDate)}${dDay ? ` (${dDay})` : ""}`}
          />
          <InlineSummaryRow label="설치 시간" value={detail.timeWindow} />
          <InlineSummaryRow label="주소" value={detail.address} />
          <InlineSummaryRow label="고객 전화번호" value={detail.customerPhone} />
          {detail.backupPhone ? (
            <InlineSummaryRow label="예비 연락처" value={detail.backupPhone} />
          ) : null}
        </div>
      </Section>

      {detail.productItems.length > 0 ? (
        <Section title="제품 구성">
          <div style={orderBoxStyle}>
            <div style={orderListStyle}>
              {detail.productItems.map((item, index) => (
                <div key={`${item.name}-${index}`} style={orderItemStyle}>
                  <div style={orderProductNameStyle}>{item.name}</div>
                  <div style={orderQuantityStyle}>x{item.quantity}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {detail.requiredCapabilities.length > 0 ? (
        <Section title="요구 역량">
          <div style={tagWrapStyle}>
            {detail.requiredCapabilities.map((capability) => (
              <span key={capability} style={tagStyle}>
                {capability}
              </span>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function ResponseSection({
  canRespond,
  onAccept,
  onReject,
}: {
  canRespond: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <Section title="응답">
      <div style={responseButtonRowStyle}>
        <button
          type="button"
          disabled={!canRespond}
          onClick={onAccept}
          style={submitButtonStyle(!canRespond)}
        >
          배정 수락
        </button>
        <div style={dividerTextStyle}>또는</div>
        <button
          type="button"
          disabled={!canRespond}
          onClick={onReject}
          style={rejectButtonStyle(!canRespond)}
        >
          배정 거절
        </button>
      </div>
    </Section>
  );
}

function ConfirmModal({
  action,
  canReject,
  customReason,
  notes,
  onCustomReasonChange,
  submitting,
  onCancel,
  onConfirm,
  onSelectReason,
  rejectionReasons,
  selectedReason,
}: {
  action: Exclude<PendingAction, null>;
  canReject: boolean;
  customReason: string;
  notes: string[];
  onCustomReasonChange: (value: string) => void;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSelectReason: (value: string) => void;
  rejectionReasons: string[];
  selectedReason: string;
}) {
  const isAccept = action === "accept";

  return (
    <div style={modalOverlayStyle} role="presentation">
      <div
        style={modalPanelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-confirm-title"
      >
        <h2 id="dispatch-confirm-title" style={modalTitleStyle}>
          {isAccept ? "배정을 수락할까요?" : "배정을 거절할까요?"}
        </h2>
        {isAccept ? (
          <div style={modalDescriptionStyle}>
            <div style={modalNoteListStyle}>
              {notes.map((note) => (
                <div key={note} style={modalNoteItemStyle}>
                  {note}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={modalDescriptionStyle}>
            <div style={labelStyle}>거절 사유</div>
            <div style={reasonListStyle}>
              {rejectionReasons.map((reason) => (
                <label key={reason} style={reasonItemStyle(selectedReason === reason)}>
                  <input
                    type="radio"
                    name="rejectReason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={(event) => onSelectReason(event.target.value)}
                    style={radioStyle}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
            {selectedReason === "기타" ? (
              <textarea
                value={customReason}
                onChange={(event) => onCustomReasonChange(event.target.value)}
                rows={3}
                placeholder="거절 사유를 입력해 주세요"
                style={textareaStyle}
              />
            ) : null}
          </div>
        )}
        <div style={modalButtonRowStyle}>
          <button type="button" onClick={onCancel} disabled={submitting} style={secondaryButtonStyle}>
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || (!isAccept && !canReject)}
            style={isAccept ? confirmButtonStyle : rejectConfirmButtonStyle}
          >
            {submitting ? "제출 중..." : isAccept ? "수락하기" : "거절하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function InlineSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={inlineSummaryRowStyle}>
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
  marginBottom: 8,
  letterSpacing: 0,
  lineHeight: 1.25,
};

const descriptionStyle: CSSProperties = {
  margin: "0 0 26px",
  color: "rgba(24,24,27,0.7)",
  fontSize: FONT_SIZE.body,
  lineHeight: 1.6,
};

const sectionStyle: CSSProperties = {
  marginTop: 26,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: FONT_SIZE.sectionTitle,
  fontWeight: 700,
  margin: "0 0 12px",
  color: TEXT_COLOR,
};

const successMarkStyle: CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: PRIMARY_COLOR,
  color: "#fff",
  fontSize: 32,
  fontWeight: 800,
  marginBottom: 16,
};

const warningMarkStyle: CSSProperties = {
  ...successMarkStyle,
  background: "#8a5600",
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

const modalNoteListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const modalNoteItemStyle: CSSProperties = {
  color: "rgba(24,24,27,0.75)",
  fontSize: FONT_SIZE.body,
  lineHeight: 1.55,
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

const rejectConfirmButtonStyle: CSSProperties = {
  ...confirmButtonStyle,
  background: "#7a1b1b",
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

const inlineSummaryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 14,
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
  textAlign: "right",
};

const orderBoxStyle: CSSProperties = {
  border: "1px solid #ececef",
  borderRadius: 8,
  background: "#f7f7f8",
  padding: 12,
};

const orderListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const orderItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const orderProductNameStyle: CSSProperties = {
  fontSize: FONT_SIZE.control,
  fontWeight: 600,
  lineHeight: 1.4,
};

const orderQuantityStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: FONT_SIZE.control,
  fontWeight: 700,
};

const responseButtonRowStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const dividerTextStyle: CSSProperties = {
  textAlign: "center",
  color: "#71717a",
  fontSize: FONT_SIZE.helper,
  fontWeight: 700,
  lineHeight: 1.4,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: FONT_SIZE.control,
  fontWeight: 600,
  marginBottom: 8,
};

const tagWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 10,
};

const tagStyle: CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 999,
  background: "#fff",
  padding: "8px 12px",
  fontSize: FONT_SIZE.helper,
  fontWeight: 700,
};

const reasonListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const radioStyle: CSSProperties = {
  width: 22,
  height: 22,
  flexShrink: 0,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 96,
  marginTop: 10,
  padding: "15px 14px",
  borderRadius: CONTROL_RADIUS,
  border: `1px solid ${BORDER_COLOR}`,
  background: "#fff",
  fontSize: FONT_SIZE.control,
  color: PRIMARY_COLOR,
  boxSizing: "border-box",
  outline: "none",
  resize: "vertical",
};

function noticeStyle(tone: "blue" | "green" | "red" | "amber"): CSSProperties {
  const colors = {
    blue: { bg: "#eef5ff", color: "#1d4f91" },
    green: { bg: "#eef8ee", color: "#1d5e1d" },
    red: { bg: "#fdecec", color: "#7a1b1b" },
    amber: { bg: "#fff6e5", color: "#8a5600" },
  }[tone];

  return {
    padding: 12,
    borderRadius: 8,
    background: colors.bg,
    color: colors.color,
    fontSize: FONT_SIZE.helper,
    lineHeight: 1.55,
    marginBottom: 16,
  };
}

function reasonItemStyle(checked: boolean): CSSProperties {
  return {
    display: "flex",
    gap: 12,
    alignItems: "center",
    minHeight: CONTROL_HEIGHT,
    padding: "12px 14px",
    borderRadius: CONTROL_RADIUS,
    border: `1px solid ${checked ? PRIMARY_COLOR : BORDER_COLOR}`,
    background: checked ? "#f7f7f8" : "#fff",
    color: TEXT_COLOR,
    fontSize: FONT_SIZE.control,
    fontWeight: 600,
    cursor: "pointer",
  };
}

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

function rejectButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...submitButtonStyle(disabled),
    border: `1px solid ${disabled ? "#ccc" : "#8f1d1d"}`,
    background: disabled ? "#f4f4f5" : "#fff",
    color: disabled ? "#a1a1aa" : "#8f1d1d",
  };
}
