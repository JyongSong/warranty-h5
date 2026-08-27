"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import { getErrorMessage } from "@/lib/error";
import {
  formatBackofficeDateTime,
  formatBackofficePhone,
  formatInstallationMatchTier,
} from "@/lib/backoffice/table-formatting";
import installationEventLabels from "@/lib/installation/orders/views/label-installation-event.json";
import installationStatusLabels from "@/lib/installation/orders/views/label-installation-status.json";
import {
  approveInstallationAssignmentAction,
  cancelInstallationOrderAction,
  completeInstallationOrderAction,
  createManualInstallationAssignmentAction,
  resolveInstallationIssueAction,
  retryInstallationOrderAssignmentByAdminAction,
  retrySmsNotificationAction,
  sendCustomerInputSmsForInstallationOrdersAction,
  switchInstallationOrderToManualRequiredAction,
} from "../actions";

export type InstallationOrderDetailItem = {
  id: string;
  sourceErpOrderNo: string;
  sourceCustomerName: string | null;
  sourcePhone: string | null;
  sourceAddress: string | null;
  sourceOrderDate: string | null;
  sourceMemo: string | null;
  sourceChannel?: string;
  sourceExternalOrderNo?: string | null;
  sourceItemsJsonText: string | null;
  requiredCapabilities: string[];
  requiredAqaraAppCapability: string;
  status: string;
  activeCustomerRequestId: string | null;
  activeAssignmentId: string | null;
  currentInstallerId: string | null;
  currentInstaller: {
    name: string;
    branch: string | null;
  } | null;
  hasOpenIssue: boolean;
  lastIssueId: string | null;
  statusChangedAt: string;
  customerRequests: Array<{
    id: string;
    installAddress: string | null;
    installAddressDetail: string | null;
    installDate: string | null;
    installTimeSlot: string | null;
    customerPhone: string | null;
    // CJ 건에만 채워진다(인증을 거친 주문자 번호).
    ordererPhone?: string | null;
    customerNote: string | null;
    fallbackUsed: boolean;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  assignmentAttempts: Array<{
    id: string;
    installerId: string;
    installerName: string;
    installerBranch: string | null;
    assignmentNumber: number;
    assignmentSource: string;
    status: string;
    acceptedAt: string | null;
    happycallDueAt: string | null;
    rejectedAt: string | null;
    rejectReason: string | null;
    timedOutAt: string | null;
    createdAt: string;
  }>;
  statusEvents: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    eventType: string;
    actorType: string;
    actorEmail: string | null;
    actorInstallerName: string | null;
    actorInstallerBranch: string | null;
    actorInstallerPhone: string | null;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    actorType: string;
    actorEmail: string | null;
    actorInstallerName: string | null;
    actorInstallerBranch: string | null;
    actorInstallerPhone: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  issues: Array<{
    id: string;
    code: string;
    type: string;
    title: string;
    description: string | null;
    status: string;
    resolvedByAdminId: string | null;
    resolvedAt: string | null;
    resolutionNote: string | null;
    createdAt: string;
  }>;
  candidateRuns: Array<{
    id: string;
    reasonCode: string | null;
    createdAt: string;
    candidates: Array<{
      installerId: string;
      installerName: string;
      installerBranch: string | null;
      rank: number | null;
      isAutoRequestCandidate: boolean;
      regionTier: string | null;
      monthlyDispatchCount: number;
      lastRequestedAt: string | null;
      excludedReason: string | null;
      decisionReason: string;
    }>;
  }>;
  smsNotifications: Array<{
    id: string;
    businessEvent: string;
    recipientType: string;
    recipientName: string | null;
    recipientBranch: string | null;
    recipientPhone: string | null;
    status: string;
    providerStatus: string | null;
    providerStatusCode: string | null;
    providerReason: string | null;
    providerReportedAt: string | null;
    providerCheckedAt: string | null;
    retryable: boolean;
    failureReason: string | null;
    retryCount: number;
    deliveryCheckCount: number;
    sentAt: string | null;
    createdAt: string;
  }>;
  installerCandidates: Array<{
    rank: number;
    installerId: string;
    installerName: string;
    installerBranch: string | null;
    phone: string | null;
    region: string | null;
    serviceAreas: string[];
    monthlyDispatchCount: number;
    matchTier: string | null;
    hasAqaraHubInventory: boolean;
  }>;
  manualAssignmentInstallers: Array<{
    rank: number;
    installerId: string;
    installerName: string;
    installerBranch: string | null;
    phone: string | null;
    region: string | null;
    serviceAreas: string[];
    monthlyDispatchCount: number;
    matchTier: string | null;
    hasAqaraHubInventory: boolean;
  }>;
};

const statusLabels: Record<string, string> = installationStatusLabels;
const eventLabels: Record<string, string> = installationEventLabels;
const CANDIDATE_RUN_HISTORY_PAGE_SIZE = 10;
const detailTabs = [
  { key: "orderStatus", label: "상태 액션" },
  { key: "orderInfo", label: "주문 정보" },
  { key: "customerRequests", label: "고객 요청" },
  { key: "assignment", label: "기사 후보/배정" },
  { key: "sms", label: "SMS" },
  { key: "issues", label: "예외" },
  { key: "timeline", label: "진행 이력" },
] as const;

type DetailTabKey = (typeof detailTabs)[number]["key"];

type OperationalDecision = {
  tone: "neutral" | "warning" | "danger";
  eyebrow: string;
  title: string;
  description: string;
  recommendation: string;
  primaryTab: DetailTabKey;
  primaryLabel: string;
};

type AdminDialogState =
  | { kind: "sendCustomerInputSms" }
  | { kind: "manualAssignment"; installerId: string; manualReason: string }
  | { kind: "switchToManual"; reason: string }
  | { kind: "adminRetryAssignment"; reason: string }
  | { kind: "approveAssignment" }
  | { kind: "completeOrder"; reason: string }
  | { kind: "cancelOrder"; reason: string }
  | { kind: "resolveIssue"; issueId: string; note: string };

export default function InstallationOrderDetail({
  item,
  returnPath = "/backoffice/installations",
  displayMode = "page",
}: {
  item: InstallationOrderDetailItem;
  returnPath?: string;
  displayMode?: "page" | "panel";
}) {
  const router = useRouter();
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof detailTabs)[number]["key"]>("orderStatus");
  const [dialog, setDialog] = useState<AdminDialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isLeavingDetail, setIsLeavingDetail] = useState(false);
  const pending = pendingActionKey !== null;
  const openIssues = sortByIssueTimelineDesc(
    item.issues.filter((issue) => issue.status === "OPEN" && !issue.resolvedAt),
  );
  const resolvedIssues = sortByIssueTimelineDesc(
    item.issues.filter((issue) => issue.status !== "OPEN" || issue.resolvedAt),
  );
  const statusEvents = sortByCreatedAtDesc(item.statusEvents);
  const groupedStatusEvents = groupEquivalentStatusEvents(statusEvents);
  const assignmentAttempts = sortByCreatedAtDesc(item.assignmentAttempts);
  const customerRequests = sortByCreatedAtDesc(item.customerRequests);
  const candidateRuns = sortByCreatedAtDesc(item.candidateRuns);
  const smsNotifications = sortByNotificationTimelineDesc(item.smsNotifications);
  const operationalDecision = getOperationalDecision(item);
  const currentInstallerName = formatInstallerName(item.currentInstallerId, item.currentInstaller?.name);
  const currentInstallerBranch = formatText(item.currentInstaller?.branch);
  const activeCustomerRequest =
    customerRequests.find((request) => request.id === item.activeCustomerRequestId) ??
    customerRequests[0] ??
    null;
  const sourceProductItems = parseSourceProductItems(item.sourceItemsJsonText);
  const operationSummaryRows = [
    { label: "주문번호", value: item.sourceErpOrderNo },
    { label: "현재 상태", value: statusLabels[item.status] ?? item.status },
    { label: "예외", value: openIssues.length > 0 ? `열린 예외 ${openIssues.length}건` : "없음", colSpan: 2 as const },
    { label: "설치 희망", value: formatInstallSchedule(activeCustomerRequest?.installDate, activeCustomerRequest?.installTimeSlot) },
    { label: "설치 주소", value: formatText(activeCustomerRequest?.installAddress) },
    { label: "설치 기사 이름", value: currentInstallerName },
    { label: "설치 기사 브랜치", value: currentInstallerBranch },
  ];
  const isCjOrder = item.sourceChannel === "CJ";
  const customerInfoRows = [
    { label: "고객명", value: formatText(item.sourceCustomerName) },
    {
      label: isCjOrder ? "설치 받는 분" : "고객 전화",
      value: formatBackofficePhone(
        isCjOrder ? activeCustomerRequest?.customerPhone ?? null : item.sourcePhone,
      ),
    },
    // CJ 건에만 있다. 인증을 거친 번호라 현장 번호가 안 될 때 기댈 곳이다.
    ...(isCjOrder
      ? [
          {
            label: "주문자(인증)",
            value: formatBackofficePhone(activeCustomerRequest?.ordererPhone ?? null),
          },
        ]
      : []),
  ];
  const addressRows = [
    { label: "원천 주소", value: formatText(item.sourceAddress) },
    { label: "고객 입력 주소", value: formatInstallAddress(activeCustomerRequest?.installAddress, activeCustomerRequest?.installAddressDetail) },
  ];
  const productRequirementRows = [
    { label: "주문 메모", value: formatText(item.sourceMemo) },
    { label: "필수 설치 능력", value: formatList(item.requiredCapabilities) },
    { label: "Aqara 요구치", value: formatText(item.requiredAqaraAppCapability) },
  ];
  const sourceOrderMetaRows = [
    { label: "판매 채널", value: isCjOrder ? "CJ 온스타일" : "자사" },
    ...(isCjOrder
      ? [{ label: "CJ 주문번호", value: formatText(item.sourceExternalOrderNo ?? null) }]
      : []),
    { label: "ERP 주문번호", value: item.sourceErpOrderNo },
    { label: "주문일", value: formatBackofficeDateTime(item.sourceOrderDate) },
    { label: "주문번호", value: item.sourceErpOrderNo },
  ];

  function manualAssign() {
    openDialog({ kind: "manualAssignment", installerId: "", manualReason: "" });
  }

  function sendCustomerInputSms() {
    openDialog({ kind: "sendCustomerInputSms" });
  }

  function switchToManual() {
    openDialog({ kind: "switchToManual", reason: "" });
  }

  function retryAssignment() {
    openDialog({ kind: "adminRetryAssignment", reason: "" });
  }

  function approveAssignment() {
    const assignmentId = item.activeAssignmentId;
    if (!assignmentId) return;
    openDialog({ kind: "approveAssignment" });
  }

  function completeOrder() {
    openDialog({ kind: "completeOrder", reason: "" });
  }

  function cancelOrder() {
    openDialog({ kind: "cancelOrder", reason: "" });
  }

  async function retrySms(notificationId: string) {
    await runAction(`sms:${notificationId}`, () => retrySmsNotificationAction(notificationId));
  }

  function resolveIssue(issueId: string) {
    openDialog({ kind: "resolveIssue", issueId, note: "" });
  }

  function openDialog(nextDialog: AdminDialogState) {
    setError(null);
    setDialogError(null);
    setDialog(nextDialog);
  }

  async function submitDialog() {
    if (!dialog) return;
    setDialogError(null);

    if (dialog.kind === "sendCustomerInputSms") {
      const ok = await runAction("sendCustomerInputSms", async () => {
        const result = await sendCustomerInputSmsForInstallationOrdersAction({ installationIds: [item.id] });
        if (!result.ok) return result;
        if (result.processedCount > 0) return { ok: true };
        if (result.failedCount > 0) return { ok: false, error: "CUSTOMER_INPUT_SMS_QUEUE_FAILED" };
        if (result.skippedAlreadyRequestedCount > 0) {
          return { ok: false, error: "CUSTOMER_INPUT_SMS_ALREADY_REQUESTED" };
        }
        return { ok: false, error: "CUSTOMER_INPUT_SMS_INVALID_STATE" };
      });
      if (ok) setDialog(null);
      return;
    }

    if (dialog.kind === "manualAssignment") {
      const installerId = dialog.installerId.trim();
      if (!installerId) {
        setDialogError("수동 배정할 설치 기사를 선택하세요.");
        return;
      }
      const manualCandidate = getManualAssignmentCandidate(item.installerCandidates, installerId);
      const manualReason = dialog.manualReason.trim();
      if (requiresManualAssignmentReason(manualCandidate) && !manualReason) {
        setDialogError("지역 예외 또는 수동 지정 사유를 입력하세요.");
        return;
      }
      const ok = await runAction("manualAssignment", () =>
        createManualInstallationAssignmentAction(item.id, installerId, manualReason || undefined),
      );
      if (ok) setDialog(null);
      return;
    }

    if (dialog.kind === "approveAssignment") {
      const assignmentId = item.activeAssignmentId;
      if (!assignmentId) return;
      const ok = await runAction("approveAssignment", () => approveInstallationAssignmentAction(assignmentId));
      if (ok) setDialog(null);
      return;
    }

    if (dialog.kind === "switchToManual") {
      const reason = dialog.reason.trim();
      if (!reason) {
        setDialogError("수동 처리 전환 사유를 입력하세요.");
        return;
      }
      const ok = await runAction("switchToManual", () => switchInstallationOrderToManualRequiredAction(item.id, reason));
      if (ok) setDialog(null);
      return;
    }

    if (dialog.kind === "adminRetryAssignment") {
      const reason = dialog.reason.trim();
      if (!reason) {
        setDialogError("기사 후보를 다시 찾는 사유를 입력하세요.");
        return;
      }
      const ok = await runAction("adminRetryAssignment", () => retryInstallationOrderAssignmentByAdminAction(item.id, reason));
      if (ok) setDialog(null);
      return;
    }

    if (dialog.kind === "completeOrder") {
      const reason = dialog.reason.trim();
      if (!reason) {
        setDialogError("설치 완료 처리 사유를 입력하세요.");
        return;
      }
      const ok = await runAction("completeOrder", () => completeInstallationOrderAction(item.id, reason));
      if (ok) setDialog(null);
      return;
    }

    if (dialog.kind === "cancelOrder") {
      const reason = dialog.reason.trim();
      if (!reason) {
        setDialogError("주문 취소 사유를 입력하세요.");
        return;
      }
      const ok = await runAction("cancelOrder", () => cancelInstallationOrderAction(item.id, reason));
      if (ok) setDialog(null);
      return;
    }

    const note = dialog.note.trim();
    if (!note) {
      setDialogError("예외 해결 사유를 입력하세요.");
      return;
    }
    const ok = await runAction(`issue:${dialog.issueId}`, () =>
      resolveInstallationIssueAction({ issueId: dialog.issueId, note }),
    );
    if (ok) setDialog(null);
  }

  async function runAction(actionKey: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setPendingActionKey(actionKey);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        throw new Error(result.error);
      }
      router.refresh();
      return true;
    } catch (err) {
      const message = formatOperationalMessage(getErrorMessage(err, "처리할 수 없습니다."));
      setError(message);
      if (dialog) setDialogError(message);
      return false;
    } finally {
      setPendingActionKey(null);
    }
  }

  function goBackToList() {
    if (isLeavingDetail) return;
    setIsLeavingDetail(true);
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(returnPath);
  }

  return (
    <section className={displayMode === "panel" ? "min-w-0 max-w-full px-5 py-6 lg:px-7" : "min-w-0 max-w-full px-6 py-7 lg:px-8"}>
      <header className="mb-6 border-b border-zinc-200 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {displayMode === "page" ? (
              <button
                type="button"
                onClick={goBackToList}
                disabled={isLeavingDetail}
                aria-label={isLeavingDetail ? "목록으로 돌아가는 중" : "설치 주문 목록으로 돌아가기"}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-wait disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="shrink-0 whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950">
                설치 주문 진행 상세
              </h2>
            </div>
          </div>
          {displayMode === "panel" ? (
            <button
              type="button"
              onClick={goBackToList}
              disabled={isLeavingDetail}
              className={getBackofficeButtonClass("secondary")}
            >
              {isLeavingDetail ? "닫는 중..." : "닫기"}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <OperationSummary rows={operationSummaryRows} />

      <OperationalDecisionCard
        decision={operationalDecision}
        openIssueCount={openIssues.length}
        onOpenTab={setActiveTab}
      />

      <div role="tablist" aria-label="상세 항목 탭" className="mb-5 flex gap-2 overflow-x-auto border-b border-zinc-200 whitespace-nowrap">
        {detailTabs.map((tab) => (
          <button
            key={tab.key}
            id={`detail-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              activeTab === tab.key
                ? "shrink-0 border-b-2 border-zinc-950 px-3 pb-2 text-sm font-semibold text-zinc-950"
                : "shrink-0 px-3 pb-2 text-sm font-semibold text-zinc-500 hover:text-zinc-900"
            }
          >
            {tab.label}
            <DetailTabCount
              count={getDetailTabCount(tab.key, {
                assignment: assignmentAttempts.length,
                sms: smsNotifications.length,
                issues: openIssues.length,
                timeline: groupedStatusEvents.length,
              })}
            />
          </button>
        ))}
      </div>

      <div className="grid min-w-0 max-w-full gap-5">
        <Panel title="상태 액션" visible={activeTab === "orderStatus"}>
          <StatusActions
            pending={pending}
            pendingActionKey={pendingActionKey}
            status={item.status}
            hasOpenIssue={item.hasOpenIssue}
            fallbackUsed={Boolean(activeCustomerRequest?.fallbackUsed)}
            activeAssignmentId={item.activeAssignmentId}
            onSendCustomerInputSms={sendCustomerInputSms}
            onApproveAssignment={approveAssignment}
            onManualAssign={manualAssign}
            onRetryAssignment={retryAssignment}
            onSwitchToManual={switchToManual}
            onCompleteOrder={completeOrder}
            onCancelOrder={cancelOrder}
          />
        </Panel>

        <Panel title="고객 정보" visible={activeTab === "orderInfo"}>
          <KeyValueRows rows={customerInfoRows} />
        </Panel>

        <Panel title="주소" visible={activeTab === "orderInfo"}>
          <KeyValueRows rows={addressRows} />
        </Panel>

        <Panel title="상품 및 설치 요구" visible={activeTab === "orderInfo"}>
          <SourceProductItems items={sourceProductItems} fallbackText={item.sourceMemo} />
          <div className="mt-4">
            <KeyValueRows rows={productRequirementRows} />
          </div>
        </Panel>

        <Panel title="원본 주문 정보" visible={activeTab === "orderInfo"}>
          <KeyValueRows rows={sourceOrderMetaRows} />
        </Panel>

        <Panel title="고객 요청" visible={activeTab === "customerRequests"}>
          <TimelineList>
            {customerRequests.length === 0 ? <EmptyText /> : null}
            {customerRequests.map((request) => (
              <TimelineItem
                key={request.id}
                at={request.createdAt}
                title={formatCustomerRequestStatus(request.status)}
                detail={formatCustomerRequestDetail(request)}
                meta={formatCustomerRequestMeta(request)}
              />
            ))}
          </TimelineList>
        </Panel>

        <Panel title="진행 이력" visible={activeTab === "timeline"}>
          <TimelineList>
            {groupedStatusEvents.length === 0 ? <EmptyText /> : null}
            {groupedStatusEvents.map(({ event, count }) => (
              <TimelineItem
                key={event.id}
                at={event.createdAt}
                title={`${eventLabels[event.eventType] ?? event.eventType}${count > 1 ? ` · ${count}건` : ""}`}
                detail={formatStatusTransition(event.fromStatus, event.toStatus)}
                meta={[...formatStatusEventActorMeta(event), formatReasonCode(event.reason)]}
              />
            ))}
          </TimelineList>
        </Panel>

        <Panel title="운영 이슈" visible={activeTab === "issues"}>
          <IssueGroup
            title="열린 예외"
            issues={openIssues}
            pending={pending}
            pendingActionKey={pendingActionKey}
            onResolveIssue={resolveIssue}
          />
          <IssueGroup title="해결된 예외" issues={resolvedIssues} />
        </Panel>

        <Panel title="배정 이력" visible={activeTab === "assignment"}>
          <TimelineList>
            {assignmentAttempts.length === 0 ? <EmptyText /> : null}
            {assignmentAttempts.map((assignment) => (
              <TimelineItem
                key={assignment.id}
                at={assignment.createdAt}
                title={`#${assignment.assignmentNumber} ${formatInstallerName(
                  assignment.installerId,
                  assignment.installerName,
                )}`}
                detail={formatAssignmentSource(assignment.assignmentSource)}
                meta={[
                  `브랜치: ${formatText(assignment.installerBranch)}`,
                  formatAssignmentStatus(assignment.status),
                  formatAssignmentNote(assignment),
                ]}
              />
            ))}
          </TimelineList>
        </Panel>

        <Panel title="현재 기사 후보" visible={activeTab === "assignment"}>
          <InstallerCandidateTable candidates={item.installerCandidates} />
        </Panel>

        <Panel title="기사 후보 탐색 이력" visible={activeTab === "assignment"}>
          <CandidateRunHistory key={item.id} runs={candidateRuns} />
        </Panel>

        <Panel title="SMS 이력" visible={activeTab === "sms"}>
          <SmsNotificationTable
            notifications={smsNotifications}
            pending={pending}
            pendingActionKey={pendingActionKey}
            onRetrySms={retrySms}
          />
        </Panel>

      </div>
      {dialog ? (
        <AdminActionDialog
          dialog={dialog}
          error={dialogError}
          installerCandidates={item.manualAssignmentInstallers}
          pending={pending}
          onCancel={() => {
            if (pending) return;
            setDialog(null);
            setDialogError(null);
          }}
          onChange={setDialog}
          onSubmit={submitDialog}
        />
      ) : null}
    </section>
  );
}

function AdminActionDialog({
  dialog,
  error,
  installerCandidates,
  pending,
  onCancel,
  onChange,
  onSubmit,
}: {
  dialog: AdminDialogState;
  error: string | null;
  installerCandidates: InstallationOrderDetailItem["installerCandidates"];
  pending: boolean;
  onCancel: () => void;
  onChange: (dialog: AdminDialogState) => void;
  onSubmit: () => void;
}) {
  const title = getAdminDialogTitle(dialog);
  const description = getAdminDialogDescription(dialog);
  const submitLabel = getAdminDialogSubmitLabel(dialog);
  const tone = getAdminDialogTone(dialog);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-action-dialog-title"
        className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl"
      >
        <div className="mb-4">
          <h3 id="admin-action-dialog-title" className="text-base font-semibold text-zinc-950">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
        </div>

        <div className="space-y-3">
          {dialog.kind === "manualAssignment" ? (
            <>
              <ManualAssignmentInstallerSelector
                candidates={installerCandidates}
                disabled={pending}
                selectedInstallerId={dialog.installerId}
                onSelectInstaller={(installerId) => onChange({ ...dialog, installerId })}
              />
              <label className="block">
                <span className="text-xs font-semibold text-zinc-600">지역 예외 또는 수동 지정 사유</span>
                <textarea
                  value={dialog.manualReason}
                  onChange={(event) => onChange({ ...dialog, manualReason: event.target.value })}
                  disabled={pending}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
                />
              </label>
            </>
          ) : null}

          {"reason" in dialog ? (
            <label className="block">
              <span className="text-xs font-semibold text-zinc-600">사유</span>
              <textarea
                value={dialog.reason}
                onChange={(event) => onChange({ ...dialog, reason: event.target.value } as AdminDialogState)}
                disabled={pending}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
                autoFocus
              />
            </label>
          ) : null}

          {dialog.kind === "resolveIssue" ? (
            <label className="block">
              <span className="text-xs font-semibold text-zinc-600">예외 해결 사유</span>
              <textarea
                value={dialog.note}
                onChange={(event) => onChange({ ...dialog, note: event.target.value })}
                disabled={pending}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
                autoFocus
              />
            </label>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className={getBackofficeButtonClass("secondary")}
          >
            취소
          </button>
          <LoadingButton
            type="button"
            onClick={onSubmit}
            disabled={pending || (dialog.kind === "manualAssignment" && installerCandidates.length === 0)}
            loading={pending}
            loadingLabel="처리 중"
            className={getDialogSubmitButtonClass(tone)}
          >
            {submitLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export function ManualAssignmentInstallerSelector({
  candidates,
  disabled,
  selectedInstallerId,
  onSelectInstaller,
}: {
  candidates: InstallationOrderDetailItem["installerCandidates"];
  disabled: boolean;
  selectedInstallerId: string;
  onSelectInstaller: (installerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [matchOnly, setMatchOnly] = useState(false);
  const [hubOnly, setHubOnly] = useState(false);
  const [sort, setSort] = useState<ManualAssignmentInstallerSort>("recommended");
  const filteredCandidates = useMemo(
    () => filterManualAssignmentInstallers(candidates, { query, matchOnly, hubOnly, sort }),
    [candidates, hubOnly, matchOnly, query, sort],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-600">설치 기사 선택</div>
        <div className="text-xs text-zinc-500">
          {filteredCandidates.length} / {candidates.length}명
        </div>
      </div>
      {candidates.length === 0 ? (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500">
          표시할 설치 기사 후보가 없습니다.
        </div>
      ) : (
        <>
          <div className="mt-2 grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <label className="block">
              <span className="sr-only">기사명, 전화, 지역 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={disabled}
                placeholder="기사명, 전화, 지역 검색"
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 disabled:bg-zinc-100"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={matchOnly}
                    onChange={(event) => setMatchOnly(event.target.checked)}
                    disabled={disabled}
                    className="size-4 rounded border-zinc-300 accent-zinc-950"
                  />
                  지역 매칭만
                </label>
                <label className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={hubOnly}
                    onChange={(event) => setHubOnly(event.target.checked)}
                    disabled={disabled}
                    className="size-4 rounded border-zinc-300 accent-zinc-950"
                  />
                  허브 보유만
                </label>
              </div>
              <label className="block">
                <span className="sr-only">정렬</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as ManualAssignmentInstallerSort)}
                  disabled={disabled}
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
                >
                  <option value="recommended">지역 매칭 우선</option>
                  <option value="monthlyDispatchCount">월 배정 적은 순</option>
                  <option value="name">이름순</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-zinc-200">
            {filteredCandidates.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-500">
                조건에 맞는 설치 기사가 없습니다.
              </div>
            ) : null}
            {filteredCandidates.map((candidate) => (
              <label
                key={candidate.installerId}
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-zinc-100 px-3 py-3 text-sm last:border-b-0 hover:bg-zinc-50 has-[:checked]:bg-zinc-50"
              >
                <input
                  type="radio"
                  name="manualInstallerId"
                  value={candidate.installerId}
                  checked={selectedInstallerId === candidate.installerId}
                  onChange={() => onSelectInstaller(candidate.installerId)}
                  disabled={disabled}
                  className="mt-1 size-4 accent-zinc-950"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-950">{candidate.installerName}</span>
                    <StatusBadge
                      label={candidate.matchTier ? "지역 매칭" : "지역 예외"}
                      tone={candidate.matchTier ? "success" : "warning"}
                    />
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    #{candidate.rank} · {formatText(candidate.installerBranch)} · {formatBackofficePhone(candidate.phone)}
                  </span>
                  <span className="mt-1 block break-words text-xs text-zinc-600">
                    {formatText(candidate.region)} / {formatList(candidate.serviceAreas)} / 월 {candidate.monthlyDispatchCount}건
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type ManualAssignmentInstaller = InstallationOrderDetailItem["installerCandidates"][number];
type ManualAssignmentInstallerSort = "recommended" | "monthlyDispatchCount" | "name";

export function filterManualAssignmentInstallers(
  candidates: ManualAssignmentInstaller[],
  options: {
    query: string;
    matchOnly: boolean;
    hubOnly: boolean;
    sort: ManualAssignmentInstallerSort;
  },
) {
  const normalizedQuery = normalizeManualAssignmentSearchText(options.query);

  return candidates
    .filter((candidate) => {
      if (options.matchOnly && !candidate.matchTier) return false;
      if (options.hubOnly && !candidate.hasAqaraHubInventory) return false;
      if (!normalizedQuery) return true;

      return normalizeManualAssignmentSearchText(
        [
          candidate.installerName,
          candidate.installerId,
          candidate.phone,
          candidate.region,
          ...candidate.serviceAreas,
        ].join(" "),
      ).includes(normalizedQuery);
    })
    .sort((left, right) => compareManualAssignmentInstallers(left, right, options.sort));
}

function compareManualAssignmentInstallers(
  left: ManualAssignmentInstaller,
  right: ManualAssignmentInstaller,
  sort: ManualAssignmentInstallerSort,
) {
  if (sort === "name") {
    return left.installerName.localeCompare(right.installerName, "ko") || left.installerId.localeCompare(right.installerId);
  }

  const monthlyDispatchDiff = left.monthlyDispatchCount - right.monthlyDispatchCount;
  if (sort === "monthlyDispatchCount") {
    return monthlyDispatchDiff || left.installerName.localeCompare(right.installerName, "ko");
  }

  const matchDiff = Number(Boolean(right.matchTier)) - Number(Boolean(left.matchTier));
  return matchDiff || monthlyDispatchDiff || left.installerName.localeCompare(right.installerName, "ko");
}

function normalizeManualAssignmentSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
}

function getAdminDialogTitle(dialog: AdminDialogState) {
  if (dialog.kind === "sendCustomerInputSms") return "고객 입력 문자 발송";
  if (dialog.kind === "manualAssignment") return "기사 직접 지정";
  if (dialog.kind === "switchToManual") return "처리 필요 표시";
  if (dialog.kind === "adminRetryAssignment") return "기사 후보 다시 찾기";
  if (dialog.kind === "approveAssignment") return "후보 승인";
  if (dialog.kind === "completeOrder") return "설치 완료 처리";
  if (dialog.kind === "cancelOrder") return "주문 취소";
  return "예외 해결 처리";
}

function getAdminDialogDescription(dialog: AdminDialogState) {
  if (dialog.kind === "sendCustomerInputSms") {
    return "고객에게 설치 희망일과 주소를 입력할 수 있는 링크를 SMS로 보냅니다. 발송 요청이 생성되면 고객 입력 대기 상태로 전환됩니다.";
  }
  if (dialog.kind === "manualAssignment") {
    return "선택한 기사에게 설치 가능 여부 확인 SMS를 보냅니다. 지역 예외 또는 후보 목록 밖 기사라면 사유를 남겨야 합니다.";
  }
  if (dialog.kind === "switchToManual") {
    return "자동 후보/기사 응답 흐름을 멈추고 처리 필요 항목으로 표시합니다.";
  }
  if (dialog.kind === "adminRetryAssignment") {
    return "현재 조건으로 기사 후보를 다시 찾고 관리자 검토 대기로 보냅니다.";
  }
  if (dialog.kind === "approveAssignment") {
    return "선정된 기사 후보를 승인하고 배정 요청 SMS를 발송합니다.";
  }
  if (dialog.kind === "completeOrder") {
    return "설치 완료로 종료합니다. 활성 배정은 관리자 완료로 닫히고 이후 자동 진행은 실행되지 않습니다.";
  }
  if (dialog.kind === "cancelOrder") {
    return "설치건을 취소 상태로 종료합니다. 원천 주문 시스템의 주문 취소 요청은 보내지 않습니다.";
  }
  return "예외를 해결 상태로 전환하고 처리 사유를 남깁니다.";
}

function getAdminDialogSubmitLabel(dialog: AdminDialogState) {
  if (dialog.kind === "sendCustomerInputSms") return "문자 발송";
  if (dialog.kind === "manualAssignment") return "수동 배정";
  if (dialog.kind === "switchToManual") return "수동 처리 전환";
  if (dialog.kind === "adminRetryAssignment") return "다시 찾기";
  if (dialog.kind === "approveAssignment") return "후보 승인";
  if (dialog.kind === "completeOrder") return "설치 완료";
  if (dialog.kind === "cancelOrder") return "주문 취소";
  return "해결 처리";
}

function getAdminDialogTone(dialog: AdminDialogState): "default" | "primary" | "danger" {
  if (
    dialog.kind === "sendCustomerInputSms" ||
    dialog.kind === "completeOrder" ||
    dialog.kind === "approveAssignment"
  ) return "primary";
  if (dialog.kind === "cancelOrder") return "danger";
  return "primary";
}

function getDialogSubmitButtonClass(tone: "default" | "primary" | "danger") {
  if (tone === "danger") return getBackofficeButtonClass("danger");
  if (tone === "default") return getBackofficeButtonClass("secondary");
  return getBackofficeButtonClass("primary");
}

function KeyValueRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="overflow-hidden border-y border-zinc-200">
      {rows.map((row) => (
        <KeyValueRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function OperationalDecisionCard({
  decision,
  openIssueCount,
  onOpenTab,
}: {
  decision: OperationalDecision;
  openIssueCount: number;
  onOpenTab: (tab: DetailTabKey) => void;
}) {
  const toneClass = {
    neutral: "border-zinc-200 bg-zinc-50",
    warning: "border-amber-300 bg-amber-50",
    danger: "border-rose-300 bg-rose-50",
  }[decision.tone];
  const eyebrowClass = {
    neutral: "text-zinc-600",
    warning: "text-amber-800",
    danger: "text-rose-800",
  }[decision.tone];

  return (
    <section aria-labelledby="operational-decision-title" className={`mb-5 rounded-md border p-4 ${toneClass}`}>
      <div className={`text-xs font-semibold ${eyebrowClass}`}>{decision.eyebrow}</div>
      <h3 id="operational-decision-title" className="mt-1 text-base font-semibold text-zinc-950">
        {decision.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-zinc-700">{decision.description}</p>
      <p className="mt-2 text-sm font-semibold text-zinc-900">권장 조치: {decision.recommendation}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenTab(decision.primaryTab)}
          className={getBackofficeButtonClass("primary")}
        >
          {decision.primaryLabel}
        </button>
        {openIssueCount > 0 && decision.primaryTab !== "issues" ? (
          <button
            type="button"
            onClick={() => onOpenTab("issues")}
            className={getBackofficeButtonClass("secondary")}
          >
            열린 예외 {openIssueCount}건
          </button>
        ) : null}
        {decision.primaryTab !== "assignment" ? (
          <button
            type="button"
            onClick={() => onOpenTab("assignment")}
            className={getBackofficeButtonClass("primary")}
          >
            기사 후보/배정 확인
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DetailTabCount({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <>
      <span aria-hidden="true" className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-600">
        {count}
      </span>
      <span className="sr-only"> {count}건</span>
    </>
  );
}

function OperationSummary({
  rows,
}: {
  rows: Array<{ label: string; value: string; colSpan?: 2 }>;
}) {
  return (
    <div className="mb-5 grid min-w-0 grid-cols-2 border-y border-zinc-200 bg-white lg:grid-cols-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`${row.colSpan === 2 ? "col-span-2" : ""} min-w-0 border-b border-r border-zinc-100 px-3 py-3`}
        >
          <div className="text-xs font-semibold text-zinc-500">{row.label}</div>
          <div title={row.value} className="mt-1 truncate text-sm font-semibold text-zinc-950">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusActions({
  pending,
  pendingActionKey,
  status,
  hasOpenIssue,
  fallbackUsed,
  activeAssignmentId,
  onSendCustomerInputSms,
  onManualAssign,
  onApproveAssignment,
  onRetryAssignment,
  onSwitchToManual,
  onCompleteOrder,
  onCancelOrder,
}: {
  pending: boolean;
  pendingActionKey: string | null;
  status: string;
  hasOpenIssue: boolean;
  fallbackUsed: boolean;
  activeAssignmentId: string | null;
  onSendCustomerInputSms: () => void;
  onApproveAssignment: () => void;
  onManualAssign: () => void;
  onRetryAssignment: () => void;
  onSwitchToManual: () => void;
  onCompleteOrder: () => void;
  onCancelOrder: () => void;
}) {
  const statusActions = getStatusActions(
    status,
    {
      onSendCustomerInputSms,
      onManualAssign,
      onApproveAssignment,
      onRetryAssignment,
      onSwitchToManual,
      onCompleteOrder,
      onCancelOrder,
    },
    activeAssignmentId,
    hasOpenIssue,
    fallbackUsed,
  );

  return (
    <div className="grid gap-3">
      {statusActions.map((action) => (
        <div
          key={action.key}
          className="grid gap-3 border-y border-zinc-200 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-zinc-950">{action.label}</strong>
            </div>
            <p className="mt-1 text-zinc-700">{action.description}</p>
            {!action.enabled ? <p className="mt-1 text-xs font-semibold text-zinc-500">{action.disabledReason}</p> : null}
          </div>
          <div className="flex items-center sm:justify-end">
            <LoadingButton
              type="button"
              disabled={pending || !action.enabled}
              loading={pendingActionKey === action.key}
              loadingLabel="처리 중"
              onClick={action.onClick}
              title={!action.enabled ? action.disabledReason : undefined}
              className={getStatusActionButtonClass(action.tone)}
            >
              {action.buttonLabel}
            </LoadingButton>
          </div>
        </div>
      ))}
    </div>
  );
}

type StatusActionDefinition = {
  key: string;
  label: string;
  buttonLabel: string;
  resultStatusLabel: string;
  description: string;
  tone: "default" | "primary" | "danger";
  enabled: boolean;
  disabledReason: string;
  onClick: () => void;
};

type StatusActionHandlers = {
  onSendCustomerInputSms: () => void;
  onApproveAssignment: () => void;
  onManualAssign: () => void;
  onRetryAssignment: () => void;
  onSwitchToManual: () => void;
  onCompleteOrder: () => void;
  onCancelOrder: () => void;
};

function getStatusActions(
  status: string,
  handlers: StatusActionHandlers,
  activeAssignmentId?: string | null,
  hasOpenIssue = false,
  fallbackUsed = false,
): StatusActionDefinition[] {
  return [
    {
      key: "sendCustomerInputSms",
      label: "고객 입력 문자 발송",
      buttonLabel: "문자 발송",
      resultStatusLabel: statusLabels.WAITING_CUSTOMER_INPUT,
      description:
        "고객에게 설치 희망일과 주소를 입력할 수 있는 링크를 SMS로 보냅니다. 발송 요청이 생성되면 고객 입력 대기 상태로 전환됩니다.",
      tone: "primary",
      enabled: canSendCustomerInputSms(status),
      disabledReason: "고객 문자 발송 필요 상태에서만 발송할 수 있습니다.",
      onClick: handlers.onSendCustomerInputSms,
    },
    {
      key: "approveAssignment",
      label: "후보 승인",
      buttonLabel: "후보 승인",
      resultStatusLabel: statusLabels.WAITING_INSTALLER_RESPONSE,
      description:
        "자동 선정된 후보를 승인하고 기사에게 배정 요청 SMS를 보냅니다. 기사가 수락하면 배정 확정으로 진행하고, 거절하거나 응답 시간이 만료되면 차순위 후보 검토로 돌아갑니다.",
      tone: "primary",
      enabled: canApproveAssignment(status, activeAssignmentId),
      disabledReason: "관리자 검토 대기 상태의 활성 후보만 승인할 수 있습니다.",
      onClick: handlers.onApproveAssignment,
    },
    {
      key: "manualAssignment",
      label: "기사 직접 지정",
      buttonLabel: "수동 배정",
      resultStatusLabel: statusLabels.WAITING_INSTALLER_RESPONSE,
      description:
        "관리자가 선택한 기사에게 설치 가능 여부 확인 SMS를 보냅니다. 기사가 수락하면 배정 확정으로 진행하고, 거절하거나 응답 시간이 만료되면 관리자 확인 대상이 됩니다.",
      tone: "primary",
      enabled: canManuallyAssign(status, hasOpenIssue, fallbackUsed),
      disabledReason: "후보 선정 가능 또는 관리자 검토 대기 상태에서 직접 지정할 수 있습니다. 기사 응답 대기 상태는 열린 예외 또는 배송지 폴백 주문만 가능합니다.",
      onClick: handlers.onManualAssign,
    },
    {
      key: "adminRetryAssignment",
      label: "후보 자동 재탐색",
      buttonLabel: "기사 후보 다시 찾기",
      resultStatusLabel: statusLabels.WAITING_ADMIN_REVIEW,
      description:
        "현재 조건으로 기사 후보를 다시 찾고 관리자 검토 대기로 보냅니다. 후보가 있으면 관리자가 승인한 뒤 기사에게 배정 요청 SMS를 발송합니다.",
      tone: "primary",
      enabled: canRetryAssignment(status, hasOpenIssue),
      disabledReason: "후보 선정 가능, 관리자 검토 대기, 기사 응답 대기 상태의 열린 예외 주문만 후보 자동 재탐색이 가능합니다.",
      onClick: handlers.onRetryAssignment,
    },
    {
      key: "switchToManual",
      label: "처리 필요 표시",
      buttonLabel: "처리 필요 표시",
      resultStatusLabel: "처리 필요",
      description:
        "자동 후보/기사 응답 흐름을 멈추고 처리 필요 항목으로 표시합니다. 이후 직접 기사 지정 또는 후보 다시 찾기를 실행할 수 있으며, 고객이나 기사에게 자동 SMS는 발송하지 않습니다.",
      tone: "primary",
      enabled: canSwitchToManual(status),
      disabledReason: "후보 선정 가능 또는 기사 응답 대기 상태에서만 처리 필요로 표시할 수 있습니다.",
      onClick: handlers.onSwitchToManual,
    },
    {
      key: "completeOrder",
      label: "설치 완료",
      buttonLabel: "설치 완료",
      resultStatusLabel: statusLabels.COMPLETED,
      description:
        "기사가 실제 설치를 끝낸 건으로 확정합니다. 활성 배정 시도가 있으면 관리자 완료로 닫고, 설치건은 완료 상태로 종료합니다.",
      tone: "primary",
      enabled: canComplete(status),
      disabledReason: "기사 배정 완료 상태에서만 설치 완료 처리할 수 있습니다.",
      onClick: handlers.onCompleteOrder,
    },
    {
      key: "cancelOrder",
      label: "주문 취소",
      buttonLabel: "주문 취소",
      resultStatusLabel: statusLabels.CANCELLED,
      description:
        "설치건을 취소 상태로 종료합니다. 자동 배정, 고객 리마인드, 기사 timeout 처리를 모두 멈추며, 원천 주문 시스템에는 주문 취소 요청을 보내지 않습니다.",
      tone: "danger",
      enabled: canCancel(status),
      disabledReason: "이미 완료 또는 취소된 설치건은 취소할 수 없습니다.",
      onClick: handlers.onCancelOrder,
    },
  ];
}

function getStatusActionButtonClass(tone: StatusActionDefinition["tone"]) {
  if (tone === "danger") return getBackofficeButtonClass("danger");
  if (tone === "default") return getBackofficeButtonClass("secondary");
  return getBackofficeButtonClass("primary");
}

function SourceProductItems({
  items,
  fallbackText,
}: {
  items: SourceProductItem[];
  fallbackText: string | null;
}) {
  if (items.length === 0) {
    return <div className="border-y border-zinc-200 px-3 py-2 text-sm text-zinc-950">{formatText(fallbackText)}</div>;
  }

  return (
    <div className="overflow-hidden border-y border-zinc-200">
      {items.map((item, index) => (
        <div
          key={`${item.itemCode}-${item.itemName}-${index}`}
          className="grid grid-cols-[minmax(0,1fr)_140px_80px] border-b border-zinc-100 text-sm last:border-b-0"
        >
          <div className="min-w-0 px-3 py-2 font-semibold text-zinc-950">{item.itemName}</div>
          <div className="min-w-0 px-3 py-2 text-zinc-600">{item.itemCode}</div>
          <div className="px-3 py-2 text-right text-zinc-950">{item.quantity}개</div>
        </div>
      ))}
    </div>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] border-b border-zinc-100 text-sm last:border-b-0">
      <div className="bg-zinc-50 px-3 py-2 font-semibold text-zinc-600">{label}</div>
      <div className="min-w-0 whitespace-pre-wrap break-words px-3 py-2 text-zinc-950">{value}</div>
    </div>
  );
}

function TimelineList({ children }: { children: ReactNode }) {
  return <div className="min-w-0 max-w-full overflow-hidden border-y border-zinc-200">{children}</div>;
}

function TimelineItem({
  at,
  title,
  detail,
  meta,
}: {
  at?: string | null;
  title: string;
  detail?: string | null;
  meta?: Array<string | null | undefined>;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[160px_24px_minmax(0,1fr)] border-b border-zinc-100 px-3 py-3 text-sm last:border-b-0">
      <time className="pt-0.5 text-xs text-zinc-500">{formatDateTime(at)}</time>
      <div className="relative flex justify-center">
        <span className="mt-1.5 h-2 w-2 rounded-full bg-zinc-900" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-zinc-950">{title}</div>
        {detail ? <div className="mt-0.5 break-words text-zinc-700">{detail}</div> : null}
        {meta ? (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-zinc-500">
            {meta.filter(Boolean).map((value) => (
              <span key={value} className="min-w-0 break-words">{value}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CandidateRunHistory({ runs }: { runs: InstallationOrderDetailItem["candidateRuns"] }) {
  const [visibleCount, setVisibleCount] = useState(CANDIDATE_RUN_HISTORY_PAGE_SIZE);
  const visibleRuns = runs.slice(0, visibleCount);
  const remainingCount = Math.max(runs.length - visibleRuns.length, 0);

  if (runs.length === 0) return <EmptyText />;

  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-2 text-xs font-semibold text-zinc-500">
        최근 이력 {visibleRuns.length} / {runs.length}건
      </div>
      <div className="min-w-0 max-w-full overflow-hidden border-y border-zinc-200">
        {visibleRuns.map((run) => (
          <div
            key={run.id}
            className="grid gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)_120px]"
          >
            <time className="text-xs text-zinc-500">{formatDateTime(run.createdAt)}</time>
            <div className="min-w-0">
              <div className="font-semibold text-zinc-950">기사 후보 찾기 {formatReasonCode(run.reasonCode)}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                {run.candidates.slice(0, 3).map((candidate) => (
                  <span key={candidate.installerId}>
                    #{candidate.rank ?? "-"} {formatInstallerName(candidate.installerId, candidate.installerName)}
                    {" / "}
                    {formatText(candidate.installerBranch)}
                  </span>
                ))}
                {run.candidates.length > 3 ? <span>외 {run.candidates.length - 3}명</span> : null}
              </div>
            </div>
            <div className="text-zinc-600 sm:text-right">후보 {run.candidates.length}명</div>
          </div>
        ))}
      </div>
      {remainingCount > 0 ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + CANDIDATE_RUN_HISTORY_PAGE_SIZE)}
            className={getBackofficeButtonClass("primary")}
          >
            이력 {Math.min(CANDIDATE_RUN_HISTORY_PAGE_SIZE, remainingCount)}건 더보기
          </button>
        </div>
      ) : null}
    </div>
  );
}

function InstallerCandidateTable({
  candidates,
}: {
  candidates: InstallationOrderDetailItem["installerCandidates"];
}) {
  if (candidates.length === 0) return <EmptyText />;

  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-zinc-200">
      <table className="w-max min-w-[1040px] border-collapse text-left text-sm">
        <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
          <tr>
            <th className="w-16 px-3 py-2">순위</th>
            <th className="px-3 py-2">기사</th>
            <th className="px-3 py-2">매칭</th>
            <th className="px-3 py-2">지역</th>
            <th className="px-3 py-2">담당 지역</th>
            <th className="w-24 px-3 py-2 text-right">월 배정</th>
            <th className="w-28 px-3 py-2">Aqara 허브</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={`${candidate.rank}-${candidate.installerId}`} className="border-t border-zinc-100">
              <td className="px-3 py-2 font-semibold text-zinc-950">#{candidate.rank}</td>
              <td className="px-3 py-2">
                <div className="font-semibold text-zinc-950">{candidate.installerName}</div>
                <div className="text-xs text-zinc-500">{formatText(candidate.installerBranch)}</div>
              </td>
              <td className="px-3 py-2">
                <StatusBadge label={formatInstallationMatchTier(candidate.matchTier)} tone={candidate.matchTier ? "success" : "warning"} />
              </td>
              <td className="px-3 py-2 text-zinc-700">{formatText(candidate.region)}</td>
              <td className="max-w-[280px] px-3 py-2 text-zinc-700">{formatList(candidate.serviceAreas)}</td>
              <td className="px-3 py-2 text-right font-semibold text-zinc-950">{candidate.monthlyDispatchCount}건</td>
              <td className="px-3 py-2">
                <StatusBadge label={candidate.hasAqaraHubInventory ? "보유" : "미보유"} tone={candidate.hasAqaraHubInventory ? "success" : "neutral"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SmsNotificationTable({
  notifications,
  pending,
  pendingActionKey,
  onRetrySms,
}: {
  notifications: InstallationOrderDetailItem["smsNotifications"];
  pending: boolean;
  pendingActionKey: string | null;
  onRetrySms: (notificationId: string) => void;
}) {
  if (notifications.length === 0) return <EmptyText />;

  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-zinc-200">
      <table className="w-max min-w-[1200px] border-collapse text-left text-sm">
        <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
          <tr>
            <th className="px-3 py-2">생성 시각</th>
            <th className="px-3 py-2">메시지</th>
            <th className="px-3 py-2">대상</th>
            <th className="px-3 py-2">발송 상태</th>
            <th className="px-3 py-2">도달 상태</th>
            <th className="px-3 py-2">시도 횟수</th>
            <th className="px-3 py-2">실패/제외 사유</th>
            <th className="w-24 px-3 py-2 text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((notification) => {
            const smsAction = getSmsNotificationAction(notification);

            return (
              <tr key={notification.id} className="border-t border-zinc-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDateTime(notification.createdAt)}</td>
                <td className="px-3 py-2 font-semibold text-zinc-950">{formatSmsBusinessEvent(notification.businessEvent)}</td>
                <td className="px-3 py-2 text-zinc-700">
                  <div>{formatRecipientType(notification.recipientType)}</div>
                  {notification.recipientType === "INSTALLER" ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="font-semibold text-zinc-950">{formatText(notification.recipientName)}</div>
                      {notification.recipientBranch ? (
                        <div className="text-xs text-zinc-500">{notification.recipientBranch}</div>
                      ) : null}
                      <div className="whitespace-nowrap text-xs tabular-nums text-zinc-500">
                        {formatBackofficePhone(notification.recipientPhone)}
                      </div>
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge label={formatSmsStatus(notification.status)} tone={getSmsStatusTone(notification.status)} />
                </td>
                <td className="px-3 py-2 text-zinc-700">
                  <SmsDeliveryStatus notification={notification} />
                </td>
                <td className="px-3 py-2 text-zinc-700">
                  <div>{notification.retryCount}회</div>
                  <div className="text-xs text-zinc-500">
                    도달 확인 재시도 {notification.deliveryCheckCount}회
                  </div>
                  {smsAction.eligibilityLabel ? (
                    <div className="text-xs text-zinc-500">{smsAction.eligibilityLabel}</div>
                  ) : null}
                </td>
                <td className="max-w-[280px] px-3 py-2 text-zinc-600">
                  {getSmsFailureReasonText(notification)}
                </td>
                <td className="px-3 py-2 text-right">
                  {smsAction.kind ? (
                    <LoadingButton
                      type="button"
                      disabled={pending}
                      loading={pendingActionKey === `sms:${notification.id}`}
                      loadingLabel={smsAction.loadingLabel}
                      onClick={() => onRetrySms(notification.id)}
                      className={getBackofficeButtonClass("primary", "sm")}
                    >
                      {smsAction.buttonLabel}
                    </LoadingButton>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-zinc-200 bg-zinc-100 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold ${toneClass}`}>
      {label}
    </span>
  );
}

function SmsDeliveryStatus({
  notification,
}: {
  notification: InstallationOrderDetailItem["smsNotifications"][number];
}) {
  const delivery = getSmsDeliveryStatusView(notification);

  return (
    <div className="space-y-1">
      <StatusBadge label={delivery.label} tone={delivery.tone} />
      {delivery.detail ? <div className="text-xs text-zinc-500">{delivery.detail}</div> : null}
      {notification.providerCheckedAt ? (
        <div className="text-xs text-zinc-500">확인 {formatDateTime(notification.providerCheckedAt)}</div>
      ) : null}
    </div>
  );
}

function HistoryRows({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden border-y border-zinc-200">
      {children}
    </div>
  );
}

function HistoryRow({
  at,
  title,
  detail,
  note,
  action,
}: {
  at?: string | null;
  title: string;
  detail?: string | null;
  note?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0">
      <time className="text-xs text-zinc-500">{formatDateTime(at)}</time>
      <div className="min-w-0">
        <div className="truncate font-semibold text-zinc-950">{title}</div>
        {detail ? <div className="truncate text-zinc-700">{detail}</div> : null}
        {note ? <div className="truncate text-xs text-zinc-500">{note}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  pending = false,
  pendingActionKey,
  onResolveIssue,
}: {
  title: string;
  issues: InstallationOrderDetailItem["issues"];
  pending?: boolean;
  pendingActionKey?: string | null;
  onResolveIssue?: (issueId: string) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500">{title}</h4>
      <HistoryRows>
        {issues.length === 0 ? <EmptyText /> : null}
        {issues.map((issue) => (
          <HistoryRow
            key={issue.id}
            at={issue.createdAt}
            title={issue.title}
            detail={`${formatIssueStatus(issue.status)}${issue.resolvedAt ? ` / 해결 ${formatDateTime(issue.resolvedAt)}` : ""}${issue.resolvedByAdminId ? ` / ${issue.resolvedByAdminId}` : ""}`}
            note={issue.resolutionNote ?? issue.description}
            action={
              onResolveIssue && issue.status === "OPEN" && !issue.resolvedAt ? (
                <LoadingButton
                  type="button"
                  className={getBackofficeButtonClass("primary", "sm")}
                  disabled={pending}
                  loading={pendingActionKey === `issue:${issue.id}`}
                  loadingLabel="처리 중"
                  onClick={() => onResolveIssue(issue.id)}
                >
                  해결 처리
                </LoadingButton>
              ) : null
            }
          />
        ))}
      </HistoryRows>
    </div>
  );
}

function Panel({
  title,
  children,
  visible = true,
}: {
  title: string;
  children: ReactNode;
  visible?: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-zinc-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-950">{title}</h3>
      {children}
    </div>
  );
}

function EmptyText() {
  return <div className="py-6 text-center text-sm text-zinc-500">표시할 항목이 없습니다.</div>;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR");
}

function formatInstallSchedule(date: string | null | undefined, timeSlot: string | null | undefined) {
  return [date?.trim(), timeSlot?.trim()].filter(Boolean).join(" · ") || "-";
}

function formatAssignmentNote(assignment: InstallationOrderDetailItem["assignmentAttempts"][number]) {
  const details = [
    assignment.acceptedAt ? `수락 ${formatDateTime(assignment.acceptedAt)}` : null,
    assignment.happycallDueAt ? `해피콜 예정 ${formatDateTime(assignment.happycallDueAt)}` : null,
    assignment.rejectedAt ? `거절 ${formatDateTime(assignment.rejectedAt)}` : null,
    assignment.timedOutAt ? `응답 기한 만료 ${formatDateTime(assignment.timedOutAt)}` : null,
    assignment.rejectReason,
  ].filter(Boolean);

  return details.length > 0 ? details.join(" / ") : null;
}

function formatText(value: string | null | undefined) {
  return value?.trim() || "-";
}

function formatInstallerName(installerId: string | null | undefined, installerName: string | null | undefined) {
  return installerName?.trim() || formatText(installerId);
}

function formatInstallAddress(address: string | null | undefined, detail: string | null | undefined) {
  return [address, detail]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ") || "-";
}

function formatOptionalInstallAddress(address: string | null | undefined, detail: string | null | undefined) {
  const formatted = formatInstallAddress(address, detail);
  return formatted === "-" ? null : formatted;
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "-";
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "-";
  return statusLabels[value] ?? value;
}

export function formatStatusTransition(fromStatus: string | null | undefined, toStatus: string) {
  const toLabel = formatStatus(toStatus);
  if (!fromStatus) return `현재 상태: ${toLabel}`;

  const fromLabel = formatStatus(fromStatus);
  if (fromStatus === toStatus) return `${toLabel} 상태 유지`;
  return `${fromLabel} → ${toLabel}`;
}

function formatCustomerRequestStatus(value: string | null | undefined) {
  const customerRequestStatusLabels: Record<string, string> = {
    CANCELLED: "취소",
    FALLBACK_USED: "주문 배송지 사용",
    SUBMITTED: "고객 입력 완료",
    PENDING_INPUT: "고객 입력 대기",
  };
  if (!value) return "-";
  return customerRequestStatusLabels[value] ?? value;
}

function formatCustomerRequestDetail(request: InstallationOrderDetailItem["customerRequests"][number]) {
  return formatOptionalInstallAddress(request.installAddress, request.installAddressDetail);
}

function formatCustomerRequestMeta(request: InstallationOrderDetailItem["customerRequests"][number]) {
  return [
    request.installDate ? `희망일: ${request.installDate}` : null,
    request.installTimeSlot ? `희망시간: ${request.installTimeSlot}` : null,
    request.customerNote ? `요청사항: ${request.customerNote}` : null,
  ];
}

function formatActorType(value: string | null | undefined) {
  const actorLabels: Record<string, string> = {
    ADMIN: "관리자",
    CUSTOMER: "고객",
    INSTALLER: "기사",
    SYSTEM: "시스템",
  };
  if (!value) return "-";
  return actorLabels[value] ?? value;
}

export function formatStatusEventActorMeta(
  event: Pick<
    InstallationOrderDetailItem["statusEvents"][number],
    | "actorType"
    | "actorEmail"
    | "actorInstallerName"
    | "actorInstallerBranch"
    | "actorInstallerPhone"
  >,
) {
  if (event.actorType === "ADMIN") {
    return [`처리자: 관리자 ${formatText(event.actorEmail)}`];
  }

  if (event.actorType === "INSTALLER") {
    return [
      `처리자: 기사 ${formatText(event.actorInstallerName)}`,
      `소속: ${formatText(event.actorInstallerBranch)}`,
      `전화: ${formatBackofficePhone(event.actorInstallerPhone)}`,
    ];
  }

  return [`처리자: ${formatActorType(event.actorType)}`];
}

function formatAssignmentSource(value: string | null | undefined) {
  const sourceLabels: Record<string, string> = {
    AUTO: "자동 배정",
    ADMIN_RETRY: "관리자 재시도",
    MANUAL_DIRECT: "관리자 직접 지정",
  };
  if (!value) return "-";
  return sourceLabels[value] ?? value;
}

export function formatOperationalMessage(value: string | null | undefined) {
  const reasonLabels: Record<string, string> = {
    ACTIVE_ASSIGNMENT_EXISTS: "이미 진행 중인 기사 배정 있음",
    CUSTOMER_NO_INPUT_96H_SOURCE_ORDER_USED: "고객 미입력 96시간 경과 - 주문 정보 사용",
    CUSTOMER_NO_INPUT_96H_INSUFFICIENT_SOURCE_ORDER: "고객 미입력 96시간 경과 - 주문 정보 부족",
    CUSTOMER_INPUT_SMS_ALREADY_REQUESTED: "고객 입력 문자가 이미 요청됨",
    CUSTOMER_INPUT_SMS_INVALID_STATE: "현재 상태에서는 고객 입력 문자를 발송할 수 없음",
    CUSTOMER_INPUT_SMS_QUEUE_FAILED: "고객 입력 문자 발송 요청 실패",
    DUPLICATE_INSTALLER_REQUEST: "이미 요청한 기사 중복 선정",
    INSTALLER_CANDIDATE_NOT_FOUND: "후보 기사 없음",
    INSTALLER_RESPONSE_TIMEOUT: "기사 응답 기한 만료",
    MISSING_INSTALL_DATE: "설치 희망일 없음",
    NO_CAPABILITY_MATCH: "설치 능력 조건에 맞는 기사 없음",
    NO_REGION_MATCH: "지역 조건에 맞는 기사 없음",
    ORDER_PRODUCT_REQUIREMENT_UNMAPPED: "제품 요구사항 미매핑",
    PHONE_11_DIGITS_REQUIRED: "휴대전화번호 형식 오류",
    REVALIDATION_FAILED: "후보 재검증 실패",
    SMS_DELIVERY_FAILED: "SMS 도달 실패",
    SMS_DELIVERY_REPORT_API_FAILED: "SMS 도달 결과 조회 실패",
    SMS_DELIVERY_STATUS_UNCONFIRMED: "SMS 도달 결과 확인 불가",
    SMS_FAILED: "SMS 발송 실패",
    SMS_SEND_OUTCOME_UNKNOWN: "SMS 발송 결과 확인 필요",
    STALE_NOTIFICATION_SKIPPED: "이미 종료된 SMS 요청으로 발송 제외",
    SYSTEM_SMS_RETRY_PENDING: "SMS 재발송 대기",
    UNPARSABLE_INSTALL_ADDRESS: "설치 주소 파싱 불가",
  };
  if (!value) return "-";
  const normalized = value.trim();
  const exactLabel = reasonLabels[normalized];
  if (exactLabel) return exactLabel;

  const prefixedCode = normalized.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/);
  if (prefixedCode) {
    const label = reasonLabels[prefixedCode[1]] ?? "시스템 처리 사유 확인 필요";
    return prefixedCode[2] ? `${label}: ${prefixedCode[2]}` : label;
  }

  if (/^[A-Z][A-Z0-9_]+$/.test(normalized)) return "시스템 처리 사유 확인 필요";
  return normalized;
}

function formatReasonCode(value: string | null | undefined) {
  return formatOperationalMessage(value);
}

function formatIssueStatus(value: string | null | undefined) {
  const issueStatusLabels: Record<string, string> = {
    OPEN: "열림",
    RESOLVED: "해결",
  };
  if (!value) return "-";
  return issueStatusLabels[value] ?? value;
}

function formatAssignmentStatus(value: string | null | undefined) {
  const assignmentStatusLabels: Record<string, string> = {
    INSTALLER_ACCEPTED: "수락",
    ADMIN_COMPLETED: "관리자 완료",
    ADMIN_MANUAL_OVERRIDDEN: "관리자 수동 변경",
    CANCELLED: "취소",
    INSTALLER_REJECTED: "기사 거절",
    SYSTEM_SMS_FAILED: "SMS 발송 실패",
    SYSTEM_SMS_RETRY_PENDING: "SMS 재발송 대기",
    INSTALLER_RESPONSE_TIMED_OUT: "응답 기한 만료",
    WAITING_ADMIN_REVIEW: "관리자 검토 대기",
    WAITING_INSTALLER_RESPONSE: "응답 대기",
  };
  if (!value) return "-";
  return assignmentStatusLabels[value] ?? value;
}

function formatSmsBusinessEvent(value: string | null | undefined) {
  const eventLabels: Record<string, string> = {
    CUSTOMER_ASSIGNMENT_CONFIRMED: "고객 배정 확정 안내",
    CUSTOMER_INPUT_LINK: "고객 예약 정보 입력 안내",
    CUSTOMER_RESERVATION_LINK: "고객 예약 정보 입력 안내",
    CUSTOMER_RESERVATION_REMINDER: "고객 예약 정보 입력 알림",
    INSTALLER_ASSIGNMENT_REQUEST: "기사 설치 가능 여부 확인",
    INSTALLER_HAPPYCALL_GUIDE: "기사 확인 전화 안내",
  };
  if (!value) return "-";
  return eventLabels[value] ?? value;
}

function formatSmsStatus(value: string | null | undefined) {
  const smsStatusLabels: Record<string, string> = {
    DELIVERED: "도달 완료",
    FAILED: "발송 실패",
    UNKNOWN: "발송 결과 확인 필요",
    PENDING: "발송 대기",
    SENT: "발송 완료",
    SKIPPED: "발송 제외",
  };
  if (!value) return "-";
  return smsStatusLabels[value] ?? value;
}

function getSmsStatusTone(value: string | null | undefined): "neutral" | "success" | "warning" | "danger" {
  if (value === "SENT" || value === "DELIVERED") return "success";
  if (value === "FAILED") return "danger";
  if (value === "PENDING") return "warning";
  return "neutral";
}

export function getSmsDeliveryStatusView(
  notification: Pick<
    InstallationOrderDetailItem["smsNotifications"][number],
    | "sentAt"
    | "failureReason"
    | "providerStatusCode"
    | "providerStatus"
    | "providerReason"
    | "providerReportedAt"
    | "providerCheckedAt"
  >,
): { label: string; tone: "neutral" | "success" | "warning" | "danger"; detail: string | null } {
  if (!notification.sentAt) {
    return { label: "도달 확인 전", tone: "neutral", detail: null };
  }

  const statusCode = notification.providerStatusCode;
  const providerStatus = notification.providerStatus;
  const providerReason = notification.providerReason;
  const providerDelivered = hasSuccessfulProviderDelivery(notification);
  if (providerDelivered) {
    return {
      label: "도달 성공",
      tone: "success",
      detail: [statusCode, providerReason].filter(Boolean).join(" ") || formatProviderStatus(providerStatus),
    };
  }

  const isDeliveryFailure =
    notification.failureReason?.includes("SMS_DELIVERY_FAILED") ||
    providerStatus?.toUpperCase().includes("FAIL") ||
    providerStatus?.toUpperCase().includes("ERROR") ||
    (Boolean(notification.providerReportedAt) &&
      statusCode !== null &&
      !["2000", "3000", "4000"].includes(statusCode));

  if (isDeliveryFailure) {
    return {
      label: "도달 실패",
      tone: "danger",
      detail: [statusCode, providerReason].filter(Boolean).join(" ") || formatProviderStatus(providerStatus),
    };
  }

  if (!notification.providerCheckedAt) {
    return { label: "도달 확인 전", tone: "warning", detail: null };
  }

  return {
    label: "조회됨",
    tone: "neutral",
    detail: [statusCode, providerReason].filter(Boolean).join(" ") || formatProviderStatus(providerStatus),
  };
}

function hasSuccessfulProviderDelivery(
  notification: Pick<
    InstallationOrderDetailItem["smsNotifications"][number],
    "providerStatusCode" | "providerStatus"
  >,
) {
  const normalizedProviderStatus = notification.providerStatus?.trim().toUpperCase() ?? "";
  if (normalizedProviderStatus.includes("FAIL") || normalizedProviderStatus.includes("ERROR")) return false;
  if (notification.providerStatusCode) return notification.providerStatusCode === "4000";

  return normalizedProviderStatus.includes("COMPLETE") ||
    normalizedProviderStatus.includes("SUCCESS") ||
    normalizedProviderStatus.includes("DELIVER");
}

function formatProviderStatus(value: string | null | undefined) {
  if (!value) return null;
  const labels: Record<string, string> = {
    COMPLETE: "도달 처리 완료",
    DELIVERED: "도달 완료",
    FAILED: "도달 실패",
    PENDING: "도달 확인 대기",
    PROCESSING: "도달 확인 중",
    SUCCESS: "도달 성공",
  };
  return labels[value.trim().toUpperCase()] ?? formatOperationalMessage(value);
}

function formatRecipientType(value: string | null | undefined) {
  const recipientLabels: Record<string, string> = {
    CUSTOMER: "고객",
    INSTALLER: "기사",
  };
  if (!value) return "-";
  return recipientLabels[value] ?? value;
}

export function getOperationalDecision(item: InstallationOrderDetailItem): OperationalDecision {
  const openIssues = item.issues.filter((issue) => issue.status === "OPEN" && !issue.resolvedAt);
  const failedAssignment = sortByCreatedAtDesc(item.assignmentAttempts).find(
    (assignment) => assignment.status === "SYSTEM_SMS_FAILED",
  );

  if (openIssues.length > 0) {
    const issueTitles = [...new Set(openIssues.map((issue) => issue.title))].join(", ");
    return {
      tone: "danger",
      eyebrow: `운영 판단 · 열린 예외 ${openIssues.length}건`,
      title: `${issueTitles || "운영 예외"} 확인이 필요합니다`,
      description: `현재 ${formatStatus(item.status)} 상태이며 열린 예외가 남아 있어 자동 진행보다 관리자 확인이 우선입니다.`,
      recommendation: "예외의 실제 처리 결과를 확인하고 해결 사유를 기록한 뒤 다음 배정 단계를 진행하세요.",
      primaryTab: "issues",
      primaryLabel: "열린 예외 확인",
    };
  }

  if (failedAssignment && item.status === "READY_FOR_CANDIDATE_SELECTION" && !item.currentInstallerId) {
    return {
      tone: "warning",
      eyebrow: "운영 판단 · 기사 재배정 필요",
      title: "이전 기사 요청이 종료되어 담당 기사가 없습니다",
      description: `${failedAssignment.installerName} 기사에게 보낸 배정 요청이 SMS 처리 단계에서 종료됐고, 주문은 후보 선정 가능 상태로 돌아왔습니다.`,
      recommendation: "후보와 이전 요청 이력을 확인한 뒤 적합한 기사를 다시 지정하세요.",
      primaryTab: "assignment",
      primaryLabel: "기사 후보/배정 확인",
    };
  }

  if (item.status === "READY_FOR_CANDIDATE_SELECTION" && !item.currentInstallerId) {
    return {
      tone: "neutral",
      eyebrow: "운영 판단 · 다음 단계",
      title: "설치 기사 후보를 선정할 수 있습니다",
      description: "고객 요청이 접수됐고 현재 담당 기사는 없습니다.",
      recommendation: "설치 희망일과 지역 조건을 확인한 뒤 기사 후보를 선정하세요.",
      primaryTab: "assignment",
      primaryLabel: "기사 후보 확인",
    };
  }

  return {
    tone: "neutral",
    eyebrow: "운영 판단 · 현재 진행",
    title: `${formatStatus(item.status)} 단계입니다`,
    description: item.currentInstaller?.name
      ? `${item.currentInstaller.name} 기사가 현재 담당자로 지정되어 있습니다.`
      : "현재 주문 상태와 최근 이력을 확인할 수 있습니다.",
    recommendation: "상태 액션과 진행 이력을 확인해 다음 업무를 진행하세요.",
    primaryTab: "orderStatus",
    primaryLabel: "상태 액션 확인",
  };
}

function getDetailTabCount(
  tab: DetailTabKey,
  counts: Record<"assignment" | "sms" | "issues" | "timeline", number>,
) {
  if (tab === "assignment" || tab === "sms" || tab === "issues" || tab === "timeline") {
    return counts[tab];
  }
  return 0;
}

export function groupEquivalentStatusEvents(items: InstallationOrderDetailItem["statusEvents"]) {
  const groups: Array<{ event: InstallationOrderDetailItem["statusEvents"][number]; count: number }> = [];
  const groupIndexByKey = new Map<string, number>();

  for (const event of items) {
    const key = [
      event.createdAt,
      event.eventType,
      event.fromStatus ?? "",
      event.toStatus,
      event.actorType,
      event.actorEmail ?? "",
      event.actorInstallerName ?? "",
      event.reason ?? "",
    ].join("\u0000");
    const existingIndex = groupIndexByKey.get(key);
    if (existingIndex !== undefined) {
      groups[existingIndex].count += 1;
      continue;
    }

    groupIndexByKey.set(key, groups.length);
    groups.push({ event, count: 1 });
  }

  return groups;
}

export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => toTime(right.createdAt) - toTime(left.createdAt));
}

function sortByIssueTimelineDesc(items: InstallationOrderDetailItem["issues"]) {
  return sortByCreatedAtDesc(items);
}

function sortByNotificationTimelineDesc(items: InstallationOrderDetailItem["smsNotifications"]) {
  return sortByCreatedAtDesc(items);
}

function toTime(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

type SourceProductItem = {
  itemCode: string;
  itemName: string;
  quantity: number;
};

function parseSourceProductItems(value: string | null | undefined): SourceProductItem[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!isRecord(entry)) return null;

        const itemName = getStringField(entry, "item_name");
        const itemCode = getStringField(entry, "item_code");
        const quantity = getNumberField(entry, "quantity") ?? 1;

        if (!itemName && !itemCode) return null;

        return {
          itemCode: itemCode || "-",
          itemName: itemName || "-",
          quantity,
        };
      })
      .filter((item): item is SourceProductItem => item !== null);
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNumberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getManualAssignmentCandidate(
  candidates: InstallationOrderDetailItem["installerCandidates"],
  installerId: string,
) {
  return candidates.find((candidate) => candidate.installerId === installerId) ?? null;
}

function requiresManualAssignmentReason(
  candidate: InstallationOrderDetailItem["installerCandidates"][number] | null,
) {
  return !candidate || !candidate.matchTier;
}

export function canManuallyAssign(status: string, hasOpenIssue: boolean, fallbackUsed = false) {
  if (["READY_FOR_CANDIDATE_SELECTION", "WAITING_ADMIN_REVIEW"].includes(status)) {
    return true;
  }

  return (hasOpenIssue || fallbackUsed) && canSwitchToManual(status);
}

export function canSendCustomerInputSms(status: string) {
  return status === "CUSTOMER_INPUT_SMS_REQUIRED";
}

export function canRetryAssignment(status: string, hasOpenIssue: boolean) {
  return hasOpenIssue && canSwitchToManual(status);
}

function canApproveAssignment(status: string, activeAssignmentId?: string | null) {
  return status === "WAITING_ADMIN_REVIEW" && Boolean(activeAssignmentId);
}

function canSwitchToManual(status: string) {
  return ["READY_FOR_CANDIDATE_SELECTION", "WAITING_ADMIN_REVIEW", "WAITING_INSTALLER_RESPONSE"].includes(status);
}

export function canComplete(status: string) {
  return status === "INSTALLER_ASSIGNED";
}

function canCancel(status: string) {
  return !["CANCELLED", "COMPLETED"].includes(status);
}

type SmsNotificationAction = {
  kind: "retry" | null;
  buttonLabel: string | null;
  loadingLabel: string;
  eligibilityLabel: string | null;
  failureReason: string | null;
};

export function getSmsNotificationAction(
  notification: Pick<
    InstallationOrderDetailItem["smsNotifications"][number],
    "status" | "sentAt" | "retryable" | "failureReason" | "retryCount"
  >,
): SmsNotificationAction {
  if (notification.status === "PENDING" && !notification.sentAt) {
    return {
      kind: null,
      buttonLabel: null,
      loadingLabel: "처리 중",
      eligibilityLabel: "5분 주기 자동 발송 대기",
      failureReason: null,
    };
  }

  if (notification.status === "SENT" || notification.sentAt) {
    return {
      kind: "retry",
      buttonLabel: "재발송",
      loadingLabel: "재발송 중",
      eligibilityLabel: null,
      failureReason: null,
    };
  }
  if (!notification.retryable || notification.status !== "FAILED") {
    return {
      kind: null,
      buttonLabel: null,
      loadingLabel: "처리 중",
      eligibilityLabel: null,
      failureReason: null,
    };
  }

  return {
    kind: "retry",
    buttonLabel: "재발송",
    loadingLabel: "재발송 중",
    eligibilityLabel: "재발송 가능",
    failureReason: "실패 SMS",
  };
}

function getSmsFailureReasonText(notification: InstallationOrderDetailItem["smsNotifications"][number]) {
  if (notification.status === "SENT" || notification.status === "DELIVERED") return "-";

  const smsAction = getSmsNotificationAction(notification);
  const details = [smsAction.failureReason, formatOperationalMessage(notification.failureReason)].filter(
    (detail) => detail && detail !== "-",
  );

  return details.length > 0 ? details.join(" / ") : "-";
}
