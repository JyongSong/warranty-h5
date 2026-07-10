"use client";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import {
  formatBackofficeDateTime,
  formatBackofficePhone,
  formatBackofficeText,
} from "@/lib/backoffice/table-formatting";
import installationStatusLabels from "@/lib/installation/orders/views/label-installation-status.json";
import BackofficeDataTable from "../BackofficeDataTable";
import BackofficePageHeader from "../BackofficePageHeader";
import {
  approveInstallationAssignmentAction,
  approveInstallationAssignmentsAction,
} from "./actions";

export type InstallationAssignmentReviewItem = {
  id: string;
  orderId: string;
  customerRequestId: string | null;
  installerId: string;
  installerName: string;
  installerPhone: string | null;
  assignmentSource: string;
  matchTier: string | null;
  candidateRank: number | null;
  createdAt: string;
  order: {
    erpOrderNo: string;
    customerName: string | null;
    sourcePhone: string | null;
    sourceAddress: string | null;
    status: string;
  };
  request: {
    installAddress: string | null;
    installDate: string | null;
    installTimeSlot: string | null;
    customerPhone: string | null;
    customerNote: string | null;
    fallbackUsed: boolean;
    status: string;
  } | null;
};

const TABLE_PREFS_KEY = "backoffice.installationAssignmentRequests.table.v2";
const LOCKED_LEADING_COLUMN_IDS = ["selection"];
const statusLabels: Record<string, string> = installationStatusLabels;

export default function AssignmentReviewList({
  initialItems,
}: {
  initialItems: InstallationAssignmentReviewItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmAssignmentId, setConfirmAssignmentId] = useState<string | null>(null);
  const [confirmBulkApproval, setConfirmBulkApproval] = useState(false);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allAssignmentIds = useMemo(() => initialItems.map((item) => item.id), [initialItems]);
  const selectedVisibleAssignmentIds = useMemo(
    () => allAssignmentIds.filter((assignmentId) => selectedAssignmentIds.has(assignmentId)),
    [allAssignmentIds, selectedAssignmentIds],
  );
  const allVisibleAssignmentsSelected =
    allAssignmentIds.length > 0 && selectedVisibleAssignmentIds.length === allAssignmentIds.length;

  const toggleAssignmentSelection = useCallback((assignmentId: string, checked: boolean) => {
    setError(null);
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

  const toggleAllAssignments = useCallback(
    (checked: boolean) => {
      setError(null);
      setSelectedAssignmentIds(checked ? new Set(allAssignmentIds) : new Set());
    },
    [allAssignmentIds],
  );

  const approveAssignment = useCallback(
    async (assignmentId: string) => {
      setError(null);
      setPendingId(assignmentId);
      try {
        const result = await approveInstallationAssignmentAction({ assignmentId });
        if (!result.ok) {
          setError(result.message ?? result.error);
          return;
        }
        setConfirmAssignmentId(null);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    },
    [router],
  );

  const approveSelectedAssignments = useCallback(async () => {
    if (selectedVisibleAssignmentIds.length === 0) return;

    setError(null);
    setBulkPending(true);
    try {
      const result = await approveInstallationAssignmentsAction({
        assignmentIds: selectedVisibleAssignmentIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setConfirmBulkApproval(false);
      setSelectedAssignmentIds(new Set());
      if (result.failedCount > 0) {
        setError(`일괄 승인 일부 실패: 성공 ${result.approvedCount}건, 실패 ${result.failedCount}건`);
      }
      router.refresh();
    } finally {
      setBulkPending(false);
    }
  }, [router, selectedVisibleAssignmentIds]);

  const defaultSorting = useMemo<SortingState>(() => [{ id: "createdAt", desc: false }], []);
  const columns = useMemo<ColumnDef<InstallationAssignmentReviewItem>[]>(
    () => [
      {
        id: "selection",
        header: () => (
          <label className="inline-flex items-center justify-center">
            <input
              type="checkbox"
              checked={allVisibleAssignmentsSelected}
              disabled={initialItems.length === 0 || bulkPending}
              onChange={(event) => toggleAllAssignments(event.currentTarget.checked)}
              className="h-4 w-4 rounded border-zinc-300"
              aria-label="승인 대기 배정 전체 선택"
            />
          </label>
        ),
        enableHiding: false,
        enableSorting: false,
        size: 64,
        minSize: 64,
        cell: ({ row }) => (
          <label className="inline-flex items-center justify-center">
            <input
              type="checkbox"
              checked={selectedAssignmentIds.has(row.original.id)}
              disabled={pendingId === row.original.id || bulkPending}
              onChange={(event) => toggleAssignmentSelection(row.original.id, event.currentTarget.checked)}
              className="h-4 w-4 rounded border-zinc-300"
              aria-label={`${row.original.order.erpOrderNo} 배정 선택`}
            />
          </label>
        ),
      },
      {
        id: "erpOrderNo",
        accessorFn: (row) => row.order.erpOrderNo,
        header: "주문-주문번호",
        enableHiding: false,
        size: 150,
        minSize: 120,
        cell: ({ row }) => <div className="font-semibold text-zinc-950">{row.original.order.erpOrderNo}</div>,
        sortingFn: "alphanumeric",
      },
      {
        id: "installerName",
        accessorFn: (row) => row.installerName,
        header: "기사-기사명",
        enableHiding: false,
        size: 130,
        minSize: 100,
        cell: ({ row }) => <div className="font-semibold text-zinc-950">{formatText(row.original.installerName)}</div>,
        sortingFn: "alphanumeric",
      },
      {
        accessorKey: "installerId",
        header: "기사-ID",
        size: 320,
        minSize: 300,
        cell: ({ row }) => formatText(row.original.installerId),
        sortingFn: "alphanumeric",
      },
      {
        id: "installerPhone",
        accessorFn: (row) => row.installerPhone ?? "",
        header: "기사-전화",
        size: 150,
        minSize: 130,
        cell: ({ row }) => formatBackofficePhone(row.original.installerPhone),
        sortingFn: "alphanumeric",
      },
      {
        id: "installDate",
        accessorFn: (row) => row.request?.installDate ?? "",
        header: "설치-희망일",
        size: 130,
        minSize: 110,
        cell: ({ row }) => formatText(row.original.request?.installDate),
        sortingFn: "alphanumeric",
      },
      {
        id: "installTimeSlot",
        accessorFn: (row) => row.request?.installTimeSlot ?? "",
        header: "설치-희망시간",
        size: 150,
        minSize: 120,
        cell: ({ row }) => formatText(row.original.request?.installTimeSlot),
        sortingFn: "alphanumeric",
      },
      {
        id: "installAddress",
        accessorFn: (row) => row.request?.installAddress ?? row.order.sourceAddress ?? "",
        header: "설치-주소",
        size: 420,
        minSize: 180,
        cell: ({ row }) => (
          <div className="whitespace-normal break-keep leading-5 text-zinc-800">
            {formatText(row.original.request?.installAddress ?? row.original.order.sourceAddress)}
          </div>
        ),
        sortingFn: "alphanumeric",
      },
      {
        id: "customerNote",
        accessorFn: (row) => row.request?.customerNote ?? "",
        header: "설치-고객 메모",
        size: 220,
        minSize: 140,
        cell: ({ row }) => formatText(row.original.request?.customerNote),
        sortingFn: "alphanumeric",
      },
      {
        id: "customerName",
        accessorFn: (row) => row.order.customerName ?? "",
        header: "주문-고객명",
        size: 120,
        minSize: 90,
        cell: ({ row }) => formatText(row.original.order.customerName),
        sortingFn: "alphanumeric",
      },
      {
        id: "sourcePhone",
        accessorFn: (row) => row.order.sourcePhone ?? "",
        header: "주문-고객 전화",
        size: 150,
        minSize: 130,
        cell: ({ row }) => formatBackofficePhone(row.original.order.sourcePhone),
        sortingFn: "alphanumeric",
      },
      {
        accessorKey: "assignmentSource",
        header: "배정-출처",
        size: 130,
        minSize: 100,
        cell: ({ row }) => formatAssignmentSource(row.original.assignmentSource),
        sortingFn: "alphanumeric",
      },
      {
        id: "matchTier",
        accessorFn: (row) => row.matchTier ?? "",
        header: "배정-지역 매칭 단계",
        size: 160,
        minSize: 130,
        cell: ({ row }) => formatMatchTier(row.original.matchTier),
        sortingFn: "alphanumeric",
      },
      {
        id: "candidateRank",
        accessorFn: (row) => row.candidateRank ?? 0,
        header: "배정-후보 순위",
        size: 140,
        minSize: 110,
        cell: ({ row }) => row.original.candidateRank ?? "-",
        sortingFn: "basic",
      },
      {
        id: "orderStatus",
        accessorFn: (row) => formatOrderStatus(row.order.status),
        header: "운영-상태",
        enableHiding: false,
        size: 150,
        minSize: 120,
        cell: ({ row }) => <span className="font-medium text-zinc-900">{formatOrderStatus(row.original.order.status)}</span>,
        sortingFn: "alphanumeric",
      },
      {
        accessorKey: "createdAt",
        header: "배정-후보 생성",
        size: 180,
        minSize: 150,
        cell: ({ row }) => formatBackofficeDateTime(row.original.createdAt),
        sortingFn: "datetime",
      },
      {
        id: "actions",
        header: "운영-액션",
        size: 100,
        minSize: 90,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <LoadingButton
            type="button"
            loading={pendingId === row.original.id || (bulkPending && selectedAssignmentIds.has(row.original.id))}
            loadingLabel="처리 중"
            disabled={bulkPending}
            onClick={() => {
              setError(null);
              setConfirmAssignmentId(row.original.id);
            }}
            className="h-8 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            승인
          </LoadingButton>
        ),
      },
    ],
    [
      allVisibleAssignmentsSelected,
      bulkPending,
      initialItems.length,
      pendingId,
      selectedAssignmentIds,
      toggleAllAssignments,
      toggleAssignmentSelection,
    ],
  );

  return (
    <section>
      <div className="px-6 py-7 lg:px-8">
        <BackofficePageHeader title="배정 승인 대기" meta={`관리자 검토 대기 ${initialItems.length}건`} />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <LoadingButton
            type="button"
            loading={bulkPending}
            loadingLabel="일괄 승인 중"
            disabled={selectedVisibleAssignmentIds.length === 0 || pendingId !== null}
            onClick={() => {
              setError(null);
              setConfirmBulkApproval(true);
            }}
            className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            선택 일괄 승인 ({selectedVisibleAssignmentIds.length})
          </LoadingButton>
          {selectedVisibleAssignmentIds.length > 0 ? (
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => setSelectedAssignmentIds(new Set())}
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 해제
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="space-y-3 md:hidden">
          {initialItems.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
              검토 대기 배정이 없습니다.
            </div>
          ) : (
            initialItems.map((item) => (
              <article key={item.id} className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <label className="mt-1 inline-flex shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedAssignmentIds.has(item.id)}
                      disabled={pendingId === item.id || bulkPending}
                      onChange={(event) => toggleAssignmentSelection(item.id, event.currentTarget.checked)}
                      className="h-4 w-4 rounded border-zinc-300"
                      aria-label={`${item.order.erpOrderNo} 배정 선택`}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="break-all text-base font-semibold text-zinc-950">{item.order.erpOrderNo}</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      {formatText(item.order.customerName)} · {formatText(item.order.sourcePhone)}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {formatOrderStatus(item.order.status)}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm">
                  <MobileDetail label="희망일" value={formatText(item.request?.installDate)} />
                  <MobileDetail label="희망시간" value={formatText(item.request?.installTimeSlot)} />
                  <MobileDetail
                    label="설치 주소"
                    value={formatText(item.request?.installAddress ?? item.order.sourceAddress)}
                  />
                  <MobileDetail label="고객 메모" value={formatText(item.request?.customerNote)} />
                  <MobileDetail label="기사" value={`${formatText(item.installerName)} · ${formatText(item.installerPhone)}`} />
                  <MobileDetail label="기사 ID" value={formatText(item.installerId)} />
                  <MobileDetail label="배정 출처" value={formatAssignmentSource(item.assignmentSource)} />
                  <MobileDetail label="지역 매칭 단계" value={formatMatchTier(item.matchTier)} />
                  <MobileDetail label="후보 순위" value={String(item.candidateRank ?? "-")} />
                  <MobileDetail label="후보 생성" value={formatBackofficeDateTime(item.createdAt)} />
                </dl>

                <LoadingButton
                  type="button"
                  loading={pendingId === item.id || (bulkPending && selectedAssignmentIds.has(item.id))}
                  loadingLabel="처리 중"
                  disabled={bulkPending}
                  onClick={() => {
                    setError(null);
                    setConfirmAssignmentId(item.id);
                  }}
                  className="mt-4 h-10 w-full rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  승인
                </LoadingButton>
              </article>
            ))
          )}
        </div>

        <div className="hidden md:block">
          <BackofficeDataTable
            columns={columns}
            data={initialItems}
            defaultSorting={defaultSorting}
            emptyMessage="검토 대기 배정이 없습니다."
            storageKey={TABLE_PREFS_KEY}
            getRowId={(row) => row.id}
            cellClassName="align-top px-4 py-3 text-zinc-600"
            lockedLeadingColumnIds={LOCKED_LEADING_COLUMN_IDS}
          />
        </div>
      </div>
      {confirmAssignmentId ? (
        <AssignmentApproveDialog
          pending={pendingId === confirmAssignmentId}
          onCancel={() => {
            if (pendingId) return;
            setConfirmAssignmentId(null);
          }}
          onConfirm={() => approveAssignment(confirmAssignmentId)}
        />
      ) : null}
      {confirmBulkApproval ? (
        <AssignmentApproveDialog
          title="선택 후보 일괄 승인"
          description={`선택한 ${selectedVisibleAssignmentIds.length}건의 기사 후보를 승인하고 배정 요청 SMS를 발송합니다.`}
          confirmLabel="선택 일괄 승인"
          pending={bulkPending}
          onCancel={() => {
            if (bulkPending) return;
            setConfirmBulkApproval(false);
          }}
          onConfirm={approveSelectedAssignments}
        />
      ) : null}
    </section>
  );

}

function AssignmentApproveDialog({
  title = "후보 승인",
  description = "선정된 기사 후보를 승인하고 배정 요청 SMS를 발송합니다.",
  confirmLabel = "후보 승인",
  pending,
  onCancel,
  onConfirm,
}: {
  title?: string;
  description?: string;
  confirmLabel?: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-approve-dialog-title"
        className="w-full max-w-md rounded-md bg-white p-5 shadow-xl"
      >
        <h3 id="assignment-approve-dialog-title" className="text-base font-semibold text-zinc-950">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <LoadingButton
            type="button"
            onClick={onConfirm}
            loading={pending}
            loadingLabel="처리 중"
            className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-5 text-zinc-800">{value}</dd>
    </div>
  );
}

function formatText(value: string | null | undefined) {
  return formatBackofficeText(value);
}

function formatOrderStatus(value: string | null | undefined) {
  if (!value) return "-";
  return statusLabels[value] ?? value;
}

function formatAssignmentSource(value: string | null | undefined) {
  const sourceLabels: Record<string, string> = {
    ADMIN_RETRY: "관리자 재시도",
    AUTO: "자동 배정",
    MANUAL_DIRECT: "관리자 직접 지정",
  };
  if (!value) return "-";
  return sourceLabels[value] ?? value;
}

function formatMatchTier(value: string | null | undefined) {
  const tierLabels: Record<string, string> = {
    PRIMARY: "담당 지역 일치",
    REGION_ONLY: "광역 지역 일치",
  };
  if (!value) return "-";
  return tierLabels[value] ?? value;
}
