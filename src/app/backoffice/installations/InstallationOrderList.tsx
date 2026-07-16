"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import {
  formatBackofficeDateTime,
  formatBackofficePhone,
  formatBackofficeText,
} from "@/lib/backoffice/table-formatting";
import type { HistoryDateRange } from "@/lib/backoffice/history-date-range";
import installationStatusLabels from "@/lib/installation/orders/views/label-installation-status.json";
import BackofficeDataTable from "../BackofficeDataTable";
import BackofficePageHeader from "../BackofficePageHeader";
import BackofficeTablePagination, {
  type BackofficeTablePaginationModel,
} from "../BackofficeTablePagination";
import type {
  InstallationOrderSearchCondition,
  InstallationOrderSearchField,
  InstallationOrderStatusView,
} from "@/lib/installation/orders/views/orders";
import {
  approveInstallationAssignmentsAction,
  sendCustomerInputSmsForInstallationOrdersAction,
} from "./actions";

const TABLE_PREFS_KEY = "backoffice.installations.table.v3";
const BULK_ACTION_LOCKED_LEADING_COLUMN_IDS = ["selection"];

export type InstallationOrderListItem = {
  id: string;
  installationId: string;
  erpOrderNo: string;
  customerName: string | null;
  phone: string | null;
  sourceAddress: string | null;
  itemName: string | null;
  productSummary: string | null;
  sourceItemsJsonText: string | null;
  sourceOrderDate: string | null;
  status: string;
  currentInstallerId: string | null;
  hasOpenIssue: boolean;
  issueCodes: string[];
  statusChangedAt: string;
  request: {
    id: string;
    installAddress: string | null;
    installDate: string | null;
    installTimeSlot: string | null;
    customerPhone: string | null;
    fallbackUsed: boolean;
    status: string;
  } | null;
  assignment: {
    id: string;
    installerId: string;
    installerName?: string | null;
    installerPhone?: string | null;
    installerBranch?: string | null;
    assignmentNumber: number;
    status: string;
    createdAt: string;
  } | null;
  activeAttempt: {
    id: string;
    installerId: string;
    assignmentType: string;
    assignmentStatus: string;
    createdAt: string;
  } | null;
  customerRequest: {
    id: string;
    installAddress: string | null;
    installDate: string | null;
    installTimeSlot: string | null;
    customerPhone: string | null;
    fallbackUsed: boolean;
  } | null;
};

const statusLabels: Record<string, string> = installationStatusLabels;
const assignmentStatusLabels: Record<string, string> = {
  WAITING_ADMIN_REVIEW: "관리자 검토 대기",
  WAITING_INSTALLER_RESPONSE: "기사 응답 대기",
  INSTALLER_ACCEPTED: "기사 수락",
  INSTALLER_REJECTED: "기사 거절",
  INSTALLER_RESPONSE_TIMED_OUT: "기사 응답 시간 초과",
  ADMIN_MANUAL_OVERRIDDEN: "관리자 수동 변경",
  ADMIN_COMPLETED: "관리자 완료",
  SYSTEM_SMS_RETRY_PENDING: "SMS 재발송 대기",
  SYSTEM_SMS_FAILED: "SMS 발송 실패",
};
const SEARCH_FIELD_OPTIONS: Array<{ field: InstallationOrderSearchField; label: string }> = [
  { field: "orderDate", label: "주문일 범위" },
  { field: "desiredInstallDate", label: "설치희망일 범위" },
  { field: "orderNumber", label: "주문번호" },
  { field: "customerName", label: "고객이름" },
  { field: "customerPhone", label: "고객전화번호" },
  { field: "installerName", label: "기사이름" },
  { field: "installerPhone", label: "기사전화번호" },
];

type InlineSearchDateRange = {
  from: string;
  to: string;
};

export default function InstallationOrderList({
  initialItems,
  title = "설치 주문 관리",
  searchQuery = "",
  searchCondition,
  statusView = "all",
  basePath = "/backoffice/installations",
  detailSearchQuery = "",
  historyDateRange,
  statusFilterItems,
  pagination,
  showSearchControls = true,
  showStatusFilters = true,
  emptyMessage = "표시할 설치 주문이 없습니다.",
}: {
  initialItems: InstallationOrderListItem[];
  title?: string;
  searchQuery?: string;
  searchCondition?: InstallationOrderSearchCondition;
  statusView?: InstallationOrderStatusView;
  basePath?: string;
  detailSearchQuery?: string;
  historyDateRange?: HistoryDateRange;
  statusFilterItems?: Array<{ statusView: InstallationOrderStatusView; label: string; count?: number; href?: string }>;
  pagination?: BackofficeTablePaginationModel;
  showSearchControls?: boolean;
  showStatusFilters?: boolean;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedInstallationId = getSelectedInstallationId(pathname, basePath);
  const isTerminalView = statusView === "completed" || statusView === "cancelled";
  const showBulkCustomerInputSmsControls = statusView === "customerInputSmsRequired";
  const showBulkAssignmentApprovalControls = statusView === "waitingAdminReview";
  const showBulkSelectionControls = showBulkCustomerInputSmsControls || showBulkAssignmentApprovalControls;
  const lockedLeadingColumnIds = showBulkSelectionControls ? BULK_ACTION_LOCKED_LEADING_COLUMN_IDS : undefined;
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(() => new Set());
  const [bulkSmsMessage, setBulkSmsMessage] = useState<string | null>(null);
  const [bulkAssignmentMessage, setBulkAssignmentMessage] = useState<string | null>(null);
  const [isBulkSmsPending, startBulkSmsTransition] = useTransition();
  const [isBulkAssignmentPending, startBulkAssignmentTransition] = useTransition();
  const selectableOrderIds = useMemo(
    () => initialItems.filter(isCustomerInputSmsSelectable).map((item) => item.id),
    [initialItems],
  );
  const selectableAssignmentIds = useMemo(
    () =>
      initialItems
        .filter(isAssignmentApprovalSelectable)
        .map((item) => item.assignment?.id)
        .filter((assignmentId): assignmentId is string => Boolean(assignmentId)),
    [initialItems],
  );
  const selectedSelectableOrderIds = useMemo(
    () => selectableOrderIds.filter((orderId) => selectedOrderIds.has(orderId)),
    [selectableOrderIds, selectedOrderIds],
  );
  const selectedSelectableAssignmentIds = useMemo(
    () => selectableAssignmentIds.filter((assignmentId) => selectedAssignmentIds.has(assignmentId)),
    [selectableAssignmentIds, selectedAssignmentIds],
  );
  const allSelectableOrdersSelected =
    selectableOrderIds.length > 0 && selectedSelectableOrderIds.length === selectableOrderIds.length;
  const allSelectableAssignmentsSelected =
    selectableAssignmentIds.length > 0 && selectedSelectableAssignmentIds.length === selectableAssignmentIds.length;

  const toggleOrderSelection = useCallback((orderId: string, checked: boolean) => {
    setBulkSmsMessage(null);
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  }, []);

  const toggleAllSelectableOrders = useCallback((checked: boolean) => {
    setBulkSmsMessage(null);
    setSelectedOrderIds(checked ? new Set(selectableOrderIds) : new Set());
  }, [selectableOrderIds]);

  const toggleAssignmentSelection = useCallback((assignmentId: string, checked: boolean) => {
    setBulkAssignmentMessage(null);
    setSelectedAssignmentIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(assignmentId);
      } else {
        next.delete(assignmentId);
      }
      return next;
    });
  }, []);

  const toggleAllSelectableAssignments = useCallback((checked: boolean) => {
    setBulkAssignmentMessage(null);
    setSelectedAssignmentIds(checked ? new Set(selectableAssignmentIds) : new Set());
  }, [selectableAssignmentIds]);

  const sendBulkCustomerInputSms = () => {
    if (selectedSelectableOrderIds.length === 0) return;

    startBulkSmsTransition(async () => {
      const result = await sendCustomerInputSmsForInstallationOrdersAction({
        installationIds: selectedSelectableOrderIds,
      });
      if (!result.ok) {
        setBulkSmsMessage(`문자 발송 요청 실패: ${result.error}`);
        return;
      }

      setSelectedOrderIds(new Set());
      setBulkSmsMessage(
        `문자 발송 요청 완료: 생성 ${result.processedCount}건, 기존 요청 ${result.skippedAlreadyRequestedCount}건, 상태 제외 ${result.skippedInvalidStateCount}건, 실패 ${result.failedCount}건`,
      );
      router.refresh();
    });
  };

  const approveBulkAssignments = () => {
    if (selectedSelectableAssignmentIds.length === 0) return;

    startBulkAssignmentTransition(async () => {
      const result = await approveInstallationAssignmentsAction({
        assignmentIds: selectedSelectableAssignmentIds,
      });
      if (!result.ok) {
        setBulkAssignmentMessage(`일괄 승인 실패: ${result.error}`);
        return;
      }

      setSelectedAssignmentIds(new Set());
      setBulkAssignmentMessage(
        `일괄 승인 완료: 성공 ${result.approvedCount}건, 실패 ${result.failedCount}건`,
      );
      router.refresh();
    });
  };

  const defaultSorting = useMemo<SortingState>(() => [{ id: "statusChangedAt", desc: true }], []);
  const columns = useMemo<ColumnDef<InstallationOrderListItem>[]>(
    () => {
      const selectionColumn: ColumnDef<InstallationOrderListItem> = {
        id: "selection",
        header: () => (
          <label className="inline-flex items-center justify-center">
            {showBulkAssignmentApprovalControls ? (
              <input
                type="checkbox"
                checked={allSelectableAssignmentsSelected}
                disabled={selectableAssignmentIds.length === 0 || isBulkAssignmentPending}
                onChange={(event) => toggleAllSelectableAssignments(event.currentTarget.checked)}
                className="h-4 w-4 rounded border-zinc-300"
                aria-label="승인 가능한 배정 전체 선택"
              />
            ) : (
              <input
                type="checkbox"
                checked={allSelectableOrdersSelected}
                disabled={selectableOrderIds.length === 0}
                onChange={(event) => toggleAllSelectableOrders(event.currentTarget.checked)}
                className="h-4 w-4 rounded border-zinc-300"
                aria-label="발송 가능한 주문 전체 선택"
              />
            )}
          </label>
        ),
        enableHiding: false,
        enableSorting: false,
        size: 72,
        minSize: 72,
        cell: ({ row }) => {
          const item = row.original;
          if (showBulkAssignmentApprovalControls) {
            const assignmentId = item.assignment?.id;
            if (!assignmentId || !isAssignmentApprovalSelectable(item)) {
              return <span className="text-xs text-zinc-300">-</span>;
            }

            return (
              <label className="inline-flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedAssignmentIds.has(assignmentId)}
                  disabled={isBulkAssignmentPending}
                  onChange={(event) => toggleAssignmentSelection(assignmentId, event.currentTarget.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                  aria-label={`${item.erpOrderNo} 배정 선택`}
                />
              </label>
            );
          }

          if (!isCustomerInputSmsSelectable(item)) return <span className="text-xs text-zinc-300">-</span>;

          return (
            <label className="inline-flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedOrderIds.has(item.id)}
                onChange={(event) => toggleOrderSelection(item.id, event.currentTarget.checked)}
                className="h-4 w-4 rounded border-zinc-300"
                aria-label={`${item.erpOrderNo} 주문 선택`}
              />
            </label>
          );
        },
      };
      const orderNumberColumns: ColumnDef<InstallationOrderListItem>[] = [
        ...(showBulkSelectionControls ? [selectionColumn] : []),
        {
          accessorKey: "erpOrderNo",
          header: "주문-주문번호",
          enableHiding: false,
          size: 150,
          minSize: 120,
          cell: ({ row }) => (
            <Link
              href={`${basePath}/${row.original.id}${detailSearchQuery ? `?${detailSearchQuery}` : ""}`}
              aria-current={selectedInstallationId === row.original.id ? "page" : undefined}
              className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 transition hover:text-blue-900 hover:decoration-blue-500"
            >
              {row.original.erpOrderNo}
            </Link>
          ),
          sortingFn: "alphanumeric",
        },
      ];

      const orderContextColumns: ColumnDef<InstallationOrderListItem>[] = [
        {
          id: "sourceOrderDate",
          accessorFn: (row) => row.sourceOrderDate ?? "",
          header: "주문-주문일",
          size: 130,
          minSize: 110,
          cell: ({ row }) => formatBackofficeDateTime(row.original.sourceOrderDate),
          sortingFn: "alphanumeric",
        },
        {
          id: "customerName",
          accessorFn: (row) => row.customerName ?? "",
          header: "주문-고객명",
          size: 120,
          minSize: 90,
          cell: ({ row }) => (
            <span className="font-medium text-zinc-900">{formatText(row.original.customerName)}</span>
          ),
          sortingFn: "alphanumeric",
        },
        {
          id: "phone",
          accessorFn: (row) => row.phone ?? "",
          header: "주문-고객 전화",
          size: 150,
          minSize: 130,
          cell: ({ row }) => formatBackofficePhone(row.original.phone),
          sortingFn: "alphanumeric",
        },
        {
          id: "sourceAddress",
          accessorFn: (row) => row.sourceAddress ?? "",
          header: "주문-고객주소",
          size: 420,
          minSize: 180,
          cell: ({ row }) => (
            <div className="truncate leading-5 text-zinc-800" title={formatText(row.original.sourceAddress)}>
              {formatText(row.original.sourceAddress)}
            </div>
          ),
          sortingFn: "alphanumeric",
        },
        {
          id: "sourceMemo",
          accessorFn: (row) => row.productSummary ?? "",
          header: "주문-메모",
          size: 360,
          minSize: 180,
          cell: ({ row }) => (
            <div className="truncate text-zinc-700" title={formatText(row.original.productSummary)}>
              {formatText(row.original.productSummary)}
            </div>
          ),
          sortingFn: "alphanumeric",
        },
      ];

      const installationColumns: ColumnDef<InstallationOrderListItem>[] = [
        {
          id: "installDate",
          accessorFn: (row) => getInstallationOrderDate(row) ?? "",
          header: "설치-희망일",
          size: 130,
          minSize: 110,
          cell: ({ row }) => formatBackofficeDateTime(getInstallationOrderDate(row.original)),
          sortingFn: "alphanumeric",
        },
        {
          id: "installTimeSlot",
          accessorFn: (row) => row.request?.installTimeSlot ?? "",
          header: "설치-희망시간",
          size: 160,
          minSize: 130,
          cell: ({ row }) => formatText(row.original.request?.installTimeSlot),
          sortingFn: "alphanumeric",
        },
        {
          id: "installAddress",
          accessorFn: (row) => getInstallationOrderAddress(row) ?? "",
          header: "설치-주소",
          size: 420,
          minSize: 180,
          cell: ({ row }) => (
            <div
              className="truncate leading-5 text-zinc-800"
              title={formatText(getInstallationOrderAddress(row.original))}
            >
              {formatText(getInstallationOrderAddress(row.original))}
            </div>
          ),
          sortingFn: "alphanumeric",
        },
        {
          id: "installContact",
          accessorFn: (row) => row.request?.customerPhone ?? "",
          header: "설치-설치연락처",
          size: 160,
          minSize: 130,
          cell: ({ row }) => formatBackofficePhone(row.original.request?.customerPhone),
          sortingFn: "alphanumeric",
        },
      ];

      const assignmentColumns: ColumnDef<InstallationOrderListItem>[] = [
        {
          id: "assignedInstaller",
          accessorFn: (row) => row.assignment?.installerName ?? row.assignment?.installerId ?? "",
          header: "배정-기사",
          size: 180,
          minSize: 120,
          cell: ({ row }) => formatText(row.original.assignment?.installerName ?? row.original.assignment?.installerId),
          sortingFn: "alphanumeric",
        },
        {
          id: "assignedInstallerBranch",
          accessorFn: (row) => row.assignment?.installerBranch ?? "",
          header: "배정-브랜치",
          size: 180,
          minSize: 120,
          cell: ({ row }) => formatText(row.original.assignment?.installerBranch),
          sortingFn: "alphanumeric",
        },
        {
          id: "assignmentStatus",
          accessorFn: (row) => row.activeAttempt?.assignmentStatus ?? row.assignment?.status ?? "",
          header: "배정-상태",
          size: 140,
          minSize: 110,
          cell: ({ row }) => formatAssignmentStatus(
            row.original.activeAttempt?.assignmentStatus ?? row.original.assignment?.status,
          ),
          sortingFn: "alphanumeric",
        },
      ];

      const operationColumns: ColumnDef<InstallationOrderListItem>[] = [
        {
          id: "adminAttention",
          accessorFn: (row) => getAdminAttentionLabel(row),
          header: "운영-처리 사유",
          enableHiding: false,
          size: 190,
          minSize: 150,
          cell: ({ row }) => (
            <div className="space-y-0.5">
              <div className={getAdminAttentionTextClassName(row.original)}>
                {getAdminAttentionLabel(row.original)}
              </div>
              <div className="text-[11px] font-medium text-zinc-500">
                다음: {getNextActionLabel(row.original)}
              </div>
            </div>
          ),
          sortingFn: "alphanumeric",
        },
        {
          id: "nextAction",
          accessorFn: (row) => getNextActionLabel(row),
          header: "운영-다음 조치",
          enableHiding: false,
          size: 190,
          minSize: 150,
          cell: ({ row }) => (
            <span className="text-xs font-semibold text-zinc-800">
              {getNextActionLabel(row.original)}
            </span>
          ),
          sortingFn: "alphanumeric",
        },
        {
          id: "status",
          accessorFn: (row) => statusLabels[row.status] ?? row.status,
          header: "운영-상태",
          enableHiding: false,
          size: 180,
          minSize: 130,
          cell: ({ row }) => (
            <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-800">
              {statusLabels[row.original.status] ?? row.original.status}
            </span>
          ),
          sortingFn: "alphanumeric",
        },
      ];

      const statusChangedAtColumn: ColumnDef<InstallationOrderListItem> = {
          id: "statusChangedAt",
          accessorFn: (row) => row.statusChangedAt,
          header: "처리일",
          enableHiding: false,
          size: 180,
          minSize: 150,
          cell: ({ row }) => formatBackofficeDateTime(row.original.statusChangedAt),
          sortingFn: "alphanumeric",
        };
      const historyTrackingColumns: ColumnDef<InstallationOrderListItem>[] = [
        statusChangedAtColumn,
        {
          id: "finalInstaller",
          accessorFn: (row) => row.assignment?.installerId ?? "",
          header: "최종 기사",
          size: 180,
          minSize: 120,
          cell: ({ row }) => formatText(row.original.assignment?.installerId),
          sortingFn: "alphanumeric",
        },
      ];

      return isTerminalView
        ? [
            ...orderNumberColumns,
            ...installationColumns,
            ...assignmentColumns,
            ...orderContextColumns,
            ...operationColumns,
            ...historyTrackingColumns,
          ]
        : [
            ...orderNumberColumns,
            ...installationColumns,
            ...assignmentColumns,
            ...orderContextColumns,
            ...operationColumns,
            statusChangedAtColumn,
          ];
    },
    [
       allSelectableOrdersSelected,
       allSelectableAssignmentsSelected,
       basePath,
       detailSearchQuery,
       isBulkAssignmentPending,
       isTerminalView,
       selectableAssignmentIds.length,
       selectableOrderIds.length,
       selectedAssignmentIds,
       selectedInstallationId,
      selectedOrderIds,
      showBulkAssignmentApprovalControls,
      showBulkSelectionControls,
      toggleAllSelectableAssignments,
      toggleAllSelectableOrders,
      toggleAssignmentSelection,
      toggleOrderSelection,
    ],
  );

  const bulkSmsAction = showBulkCustomerInputSmsControls ? (
    <>
      <button
        type="button"
        onClick={sendBulkCustomerInputSms}
        disabled={selectedSelectableOrderIds.length === 0 || isBulkSmsPending}
        className={getBackofficeButtonClass("primary")}
      >
        {isBulkSmsPending ? "발송 요청 중..." : `선택 문자 발송 (${selectedSelectableOrderIds.length})`}
      </button>
      {bulkSmsMessage ? <span className="text-xs font-semibold text-zinc-600">{bulkSmsMessage}</span> : null}
    </>
  ) : null;
  const bulkAssignmentAction = showBulkAssignmentApprovalControls ? (
    <>
      <button
        type="button"
        onClick={approveBulkAssignments}
        disabled={selectedSelectableAssignmentIds.length === 0 || isBulkAssignmentPending}
        className={getBackofficeButtonClass("primary")}
      >
        {isBulkAssignmentPending ? "일괄 승인 중..." : `선택 일괄 승인 (${selectedSelectableAssignmentIds.length})`}
      </button>
      {bulkAssignmentMessage ? <span className="text-xs font-semibold text-zinc-600">{bulkAssignmentMessage}</span> : null}
    </>
  ) : null;
  const shouldRenderSecondaryControls =
    !showSearchControls ||
    Boolean(showStatusFilters && statusFilterItems?.length) ||
    Boolean(bulkSmsAction || bulkAssignmentAction);

  return (
    <section>
      <div className="px-6 py-7 lg:px-8">
        <BackofficePageHeader title={title} />
        <BackofficeDataTable
          columns={columns}
          data={initialItems}
          defaultSorting={defaultSorting}
          emptyMessage={emptyMessage}
          storageKey={TABLE_PREFS_KEY}
          lockedLeadingColumnIds={lockedLeadingColumnIds}
          getRowId={(row) => row.id}
          getRowClassName={(row) =>
            selectedInstallationId === row.id
              ? `${getInstallationOrderRowClassName(row)} ring-2 ring-inset ring-blue-300`
              : getInstallationOrderRowClassName(row)
          }
          cellClassName="align-top px-4 py-3 text-zinc-600"
          renderBeforeTable={(columnControls) => (
            <div className="mb-5">
              {showSearchControls ? (
                <div className="@container">
                  <div className="flex min-w-0 flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between">
                    <div className="w-full min-w-0 flex-1">
                      <InstallationOrderInlineSearchForm
                        basePath={basePath}
                        historyDateRange={historyDateRange}
                        pageSize={pagination?.pageSize}
                        searchCondition={searchCondition}
                        statusView={statusView}
                      />
                    </div>
                    <div className="self-end">{columnControls}</div>
                  </div>
                </div>
              ) : null}
              {shouldRenderSecondaryControls ? (
                <div className={`${showSearchControls ? "mt-4 " : ""}@container`}>
                  <div className="flex min-w-0 flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between">
                    <div className="w-full min-w-0 flex-1">
                      {showStatusFilters && statusFilterItems?.length ? (
                        <InstallationOrderStatusViewTabs
                          activeStatusView={statusView}
                          basePath={basePath}
                          items={statusFilterItems}
                          searchCondition={searchCondition}
                          searchQuery={searchQuery}
                          pageSize={pagination?.pageSize}
                        />
                      ) : null}
                      {bulkSmsAction || bulkAssignmentAction ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {bulkSmsAction}
                          {bulkAssignmentAction}
                        </div>
                      ) : null}
                    </div>
                    {!showSearchControls ? <div className="self-end">{columnControls}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        />
        {pagination ? <BackofficeTablePagination pagination={pagination} /> : null}
      </div>
    </section>
  );
}

function InstallationOrderInlineSearchForm({
  basePath,
  historyDateRange,
  pageSize,
  searchCondition,
  statusView,
}: {
  basePath: string;
  historyDateRange?: HistoryDateRange;
  pageSize?: number;
  searchCondition?: InstallationOrderSearchCondition;
  statusView: InstallationOrderStatusView;
}) {
  const initialSelectedField = searchCondition?.field ?? "orderDate";
  const [selectedField, setSelectedField] = useState<InstallationOrderSearchField>(
    initialSelectedField,
  );
  const [dateRange, setDateRange] = useState<InlineSearchDateRange>(() =>
    getInitialInlineSearchDateRange(searchCondition, initialSelectedField),
  );
  const isDateField = selectedField === "desiredInstallDate" || selectedField === "orderDate";
  const handleSearchFieldChange = useCallback(
    (field: InstallationOrderSearchField) => {
      setSelectedField(field);
      if (field === "desiredInstallDate" || field === "orderDate") {
        setDateRange(getInitialInlineSearchDateRange(searchCondition, field));
      }
    },
    [searchCondition],
  );

  return (
    <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
      <form
        action={basePath}
        method="get"
        className="grid grid-cols-2 items-end gap-3 @3xl:grid-cols-[minmax(11rem,auto)_minmax(0,1fr)_auto_auto]"
      >
        {statusView !== "all" ? <input type="hidden" name="statusView" value={statusView} /> : null}
        {pageSize ? <input type="hidden" name="pageSize" value={pageSize} /> : null}
        {historyDateRange ? (
          <>
            <input type="hidden" name="from" value={historyDateRange.from} />
            <input type="hidden" name="to" value={historyDateRange.to} />
            </>
        ) : null}
        <label className="col-span-2 flex min-w-0 flex-col gap-1 @3xl:col-span-1">
          <span className="text-xs font-semibold text-zinc-600">검색 조건</span>
          <select
            name="searchField"
            value={selectedField}
            onChange={(event) => handleSearchFieldChange(event.target.value as InstallationOrderSearchField)}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
          >
            {SEARCH_FIELD_OPTIONS.map((option) => (
              <option key={option.field} value={option.field}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {isDateField ? (
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-2 @3xl:col-span-1">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600">시작일</span>
              <input
                type="date"
                name="searchFrom"
                value={dateRange.from}
                onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
                required
                className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600">종료일</span>
              <input
                type="date"
                name="searchTo"
                value={dateRange.to}
                onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                required
                className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
              />
            </label>
          </div>
        ) : (
          <label className="col-span-2 flex min-w-0 flex-col gap-1 @3xl:col-span-1">
            <span className="text-xs font-semibold text-zinc-600">키워드</span>
            <input
              type="search"
              name="searchKeyword"
              defaultValue={searchCondition?.field === selectedField ? searchCondition.keyword : undefined}
              placeholder={getSearchKeywordPlaceholder(selectedField)}
              required
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950"
            />
          </label>
        )}
        <SearchSubmitButton
          type="submit"
          className={`${getBackofficeButtonClass("primary")} w-full @3xl:w-auto`}
        >
          검색
        </SearchSubmitButton>
        <Link
          href={buildSearchResetHref(basePath, statusView, pageSize)}
          className={`${getBackofficeButtonClass("secondary")} w-full @3xl:w-auto`}
        >
          초기화
        </Link>
        <p className="col-span-2 text-xs leading-5 text-zinc-500 @3xl:col-span-4">
          고객명과 고객전화번호는 정확히 일치해야 합니다. 주문번호는 ERP 주문번호, 외부 주문번호, NO_GIRL 일부 검색을 지원합니다.
        </p>
      </form>
    </div>
  );
}

function SearchSubmitButton({
  children,
  className,
  type,
}: {
  children: ReactNode;
  className: string;
  type: "submit";
}) {
  const { pending } = useFormStatus();

  return (
    <LoadingButton type={type} loading={pending} loadingLabel="검색 중..." className={className}>
      {children}
    </LoadingButton>
  );
}

function isCustomerInputSmsSelectable(item: InstallationOrderListItem) {
  return item.status === "CUSTOMER_INPUT_SMS_REQUIRED" && !item.customerRequest;
}

function isAssignmentApprovalSelectable(item: InstallationOrderListItem) {
  return item.status === "WAITING_ADMIN_REVIEW" && item.assignment?.status === "WAITING_ADMIN_REVIEW";
}

function InstallationOrderStatusViewTabs({
  activeStatusView,
  basePath,
  items,
  searchCondition,
  searchQuery,
  pageSize,
}: {
  activeStatusView: InstallationOrderStatusView;
  basePath: string;
  items: Array<{ statusView: InstallationOrderStatusView; label: string; count?: number; href?: string }>;
  searchCondition?: InstallationOrderSearchCondition;
  searchQuery: string;
  pageSize?: number;
}) {
  const overviewTabs = items.filter((item) => item.statusView === "active" || item.statusView === "attention");
  const activeTab = overviewTabs.find((item) => item.statusView === "active");
  const attentionTab = overviewTabs.find((item) => item.statusView === "attention");
  const attentionStageTabs = items.filter(isAttentionStageStatusFilterItem);
  const activeStageTabs = items.filter(isActiveStageStatusFilterItem);
  const isAttentionView = isAttentionStatusView(activeStatusView);
  const overviewActiveStatusView = isAttentionView ? "attention" : "active";
  const stageTabs = isAttentionView
    ? [
        ...(attentionTab ? [{ ...attentionTab, label: "전체" }] : []),
        ...attentionStageTabs,
      ]
    : [
        ...(activeTab ? [{ ...activeTab, label: "전체" }] : []),
        ...activeStageTabs,
      ];
  const showStageTabs = stageTabs.length > 1;

  return (
    <div className="flex flex-col gap-2" aria-label="설치 주문 필터">
      {overviewTabs.length > 0 ? (
        <div
          className="inline-flex w-fit max-w-full overflow-x-auto rounded-lg bg-zinc-100 p-1"
          role="tablist"
          aria-label="보기"
        >
          {overviewTabs.map((tab) => (
            <InstallationOrderStatusViewTab
              key={tab.statusView}
              activeStatusView={overviewActiveStatusView}
              basePath={basePath}
              pageSize={pageSize}
              searchCondition={searchCondition}
              searchQuery={searchQuery}
              tab={tab}
            />
          ))}
        </div>
      ) : null}
      {showStageTabs ? (
        <div
          className="inline-flex w-fit max-w-full overflow-x-auto rounded-lg bg-zinc-100 p-1"
          role="tablist"
          aria-label="진행 단계"
        >
          {stageTabs.map((tab) => (
            <InstallationOrderStatusViewTab
              key={tab.statusView}
              activeStatusView={activeStatusView}
              basePath={basePath}
              pageSize={pageSize}
              searchCondition={searchCondition}
              searchQuery={searchQuery}
              tab={tab}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isAttentionStatusView(statusView: InstallationOrderStatusView) {
  return (
    statusView === "attention" ||
    statusView === "attentionCustomerInputSmsRequired" ||
    statusView === "attentionAdminReview" ||
    statusView === "attentionIssueOnly"
  );
}

function isAttentionStageStatusFilterItem(item: { statusView: InstallationOrderStatusView }) {
  return (
    item.statusView === "attentionCustomerInputSmsRequired" ||
    item.statusView === "attentionAdminReview" ||
    item.statusView === "attentionIssueOnly"
  );
}

function isActiveStageStatusFilterItem(item: { statusView: InstallationOrderStatusView }) {
  return (
    item.statusView !== "active" &&
    item.statusView !== "attention" &&
    !isAttentionStageStatusFilterItem(item)
  );
}

function InstallationOrderStatusViewTab({
  activeStatusView,
  basePath,
  pageSize,
  searchCondition,
  searchQuery,
  tab,
}: {
  activeStatusView: InstallationOrderStatusView;
  basePath: string;
  pageSize?: number;
  searchCondition?: InstallationOrderSearchCondition;
  searchQuery: string;
  tab: { statusView: InstallationOrderStatusView; label: string; count?: number; href?: string };
}) {
  const isActive = activeStatusView === tab.statusView;

  return (
    <Link
      href={tab.href ?? buildStatusViewHref(basePath, tab.statusView, { searchCondition, searchQuery, pageSize })}
      aria-current={isActive ? "page" : undefined}
      role="tab"
      aria-selected={isActive}
      className={getStatusViewTabClassName(isActive)}
    >
      <span>{tab.label}</span>
      {typeof tab.count === "number" ? (
        <span className={getStatusViewTabCountClassName(isActive)}>{tab.count}</span>
      ) : null}
    </Link>
  );
}

function getStatusViewTabClassName(isActive: boolean) {
  if (isActive) {
    return "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-semibold text-zinc-950 shadow-sm ring-1 ring-zinc-200";
  }

  return "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-zinc-600 transition hover:text-zinc-950";
}

function getStatusViewTabCountClassName(isActive: boolean) {
  if (isActive) {
    return "inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs tabular-nums text-zinc-950";
  }

  return "inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-200 px-1.5 py-0.5 text-xs tabular-nums text-zinc-700";
}

function buildStatusViewHref(
  basePath: string,
  statusView: InstallationOrderStatusView,
  {
    searchCondition,
    searchQuery,
    pageSize,
  }: {
    searchCondition?: InstallationOrderSearchCondition;
    searchQuery: string;
    pageSize?: number;
  },
) {
  const params = new URLSearchParams();
  if (statusView !== "all") params.set("statusView", statusView);
  if (searchQuery) params.set("q", searchQuery);
  appendSearchConditionParams(params, searchCondition);
  if (pageSize) params.set("pageSize", String(pageSize));
  const queryString = params.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

function buildSearchResetHref(
  basePath: string,
  statusView: InstallationOrderStatusView,
  pageSize?: number,
) {
  return buildStatusViewHref(basePath, statusView, { searchQuery: "", pageSize });
}

function appendSearchConditionParams(
  params: URLSearchParams,
  condition: InstallationOrderSearchCondition | undefined,
) {
  if (!condition) return;

  params.set("searchField", condition.field);
  if (condition.keyword) params.set("searchKeyword", condition.keyword);
  if (condition.from) params.set("searchFrom", condition.from);
  if (condition.to) params.set("searchTo", condition.to);
}

function getSearchKeywordPlaceholder(field: InstallationOrderSearchField) {
  const placeholders: Partial<Record<InstallationOrderSearchField, string>> = {
    customerName: "홍길동",
    customerPhone: "01012345678",
    orderNumber: "ONS20260604942",
    installerName: "서울강남기사",
    installerPhone: "01012345678",
  };

  return placeholders[field] ?? "검색어";
}

function getInitialInlineSearchDateRange(
  searchCondition: InstallationOrderSearchCondition | undefined,
  selectedField: InstallationOrderSearchField,
): InlineSearchDateRange {
  if (searchCondition?.field === selectedField) {
    return {
      from: searchCondition.from ?? "",
      to: searchCondition.to ?? "",
    };
  }

  return getDefaultInlineSearchDateRange(selectedField) ?? { from: "", to: "" };
}

export function getDefaultInlineSearchDateRange(
  field: InstallationOrderSearchField,
  now = new Date(),
): InlineSearchDateRange | undefined {
  if (field !== "desiredInstallDate") return undefined;

  const today = new Date(`${getKstTodayDateString(now)}T00:00:00.000Z`);
  return {
    from: formatUtcDateOnly(today),
    to: formatUtcDateOnly(addUtcDays(today, 14)),
  };
}

function getKstTodayDateString(now = new Date()) {
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return formatUtcDateOnly(kstDate);
}

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatUtcDateOnly(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatText(value: string | null | undefined) {
  return formatBackofficeText(value);
}

function formatAssignmentStatus(value: string | null | undefined) {
  if (!value) return formatText(value);
  return assignmentStatusLabels[value] ?? value;
}

function getInstallationOrderAddress(row: InstallationOrderListItem) {
  if (row.status === "WAITING_CUSTOMER_INPUT") return row.request?.installAddress ?? null;
  return row.request?.installAddress ?? row.sourceAddress;
}

function getInstallationOrderDate(row: InstallationOrderListItem) {
  return row.request?.installDate ?? null;
}

function getAdminAttentionLabel(row: InstallationOrderListItem) {
  if (row.hasOpenIssue) return formatOpenIssueReason(row.issueCodes);
  if (row.status === "CUSTOMER_INPUT_SMS_REQUIRED") return "-";
  if (row.status === "WAITING_CUSTOMER_INPUT") return "-";

  return formatScheduleAttentionLabel(getInstallationOrderDate(row));
}

function formatOpenIssueReason(issueCodes: string[]) {
  const issueLabels: Record<string, string> = {
    CUSTOMER_INPUT_LINK_SMS_SEND_FAILED: "고객 입력 SMS 확인",
    CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED: "고객 배정 SMS 확인",
    INSTALLER_ASSIGNMENT_SMS_SEND_FAILED: "기사 배정 SMS 확인",
    INSTALLER_CANDIDATE_NOT_FOUND: "기사 후보 없음",
    INSTALLER_CANDIDATE_EXHAUSTED: "기사 후보 소진",
    INSTALLER_NOT_ASSIGNED: "기사 미배정",
  };
  const labels = [...new Set(issueCodes.map((code) => issueLabels[code] ?? "운영 예외 확인"))];
  if (labels.length === 0) return "열린 예외 확인";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} 외 ${labels.length - 1}건`;
}

function getNextActionLabel(row: InstallationOrderListItem) {
  if (row.hasOpenIssue) {
    if (row.issueCodes.includes("INSTALLER_ASSIGNMENT_SMS_SEND_FAILED")) return "SMS 확인 후 기사 재배정";
    if (
      row.issueCodes.includes("CUSTOMER_INPUT_LINK_SMS_SEND_FAILED") ||
      row.issueCodes.includes("CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED")
    ) {
      return "SMS 확인 또는 재발송";
    }
    if (
      row.issueCodes.includes("INSTALLER_CANDIDATE_NOT_FOUND") ||
      row.issueCodes.includes("INSTALLER_CANDIDATE_EXHAUSTED") ||
      row.issueCodes.includes("INSTALLER_NOT_ASSIGNED")
    ) {
      return "기사 후보 다시 찾기";
    }
    return "열린 예외 확인";
  }

  const nextActionLabels: Record<string, string> = {
    CUSTOMER_INPUT_SMS_REQUIRED: "고객 입력 문자 발송",
    WAITING_CUSTOMER_INPUT: "고객 입력 대기",
    READY_FOR_CANDIDATE_SELECTION: "기사 후보 선정",
    WAITING_ADMIN_REVIEW: "후보 검토 및 승인",
    WAITING_INSTALLER_RESPONSE: "기사 응답 대기",
    INSTALLER_ASSIGNED: "설치 진행 확인",
    COMPLETED: "처리 완료",
    CANCELLED: "처리 종료",
  };
  return nextActionLabels[row.status] ?? "상태 확인";
}

function formatScheduleAttentionLabel(value: string | null | undefined) {
  if (!value) return "희망일 없음";
  const targetDay = parseDateOnlyAsUtcDay(value);
  if (targetDay == null) return "희망일 확인 필요";

  const todayDay = parseDateOnlyAsUtcDay(getKstTodayDateString());
  if (todayDay == null) return "희망일 확인 필요";
  const diffDays = Math.round((targetDay.getTime() - todayDay.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return `${Math.abs(diffDays)}일 지남`;
  if (diffDays > 0 && diffDays <= 2) return `${diffDays}일 남음`;
  return "-";
}

function parseDateOnlyAsUtcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function getInstallationOrderRowClassName(row: InstallationOrderListItem) {
  const baseClassName = "border-b border-zinc-100 last:border-0";
  const adminAttentionLabel = getAdminAttentionLabel(row);

  if (row.hasOpenIssue) {
    return `${baseClassName} bg-rose-50 hover:bg-rose-100`;
  }

  if (adminAttentionLabel !== "-") {
    return `${baseClassName} bg-amber-50 hover:bg-amber-100`;
  }

  return `${baseClassName} hover:bg-zinc-50`;
}

function getSelectedInstallationId(pathname: string, basePath: string) {
  const detailPathPrefix = `${basePath}/`;
  if (!pathname.startsWith(detailPathPrefix)) return null;

  const detailSegment = pathname.slice(detailPathPrefix.length).split("/")[0];
  if (!detailSegment) return null;

  try {
    return decodeURIComponent(detailSegment);
  } catch {
    return detailSegment;
  }
}

function getAdminAttentionTextClassName(row: InstallationOrderListItem) {
  if (row.hasOpenIssue) return "text-xs font-semibold text-rose-700";
  if (getAdminAttentionLabel(row) === "-") return "text-xs font-semibold text-zinc-400";

  return "text-xs font-semibold text-amber-700";
}
