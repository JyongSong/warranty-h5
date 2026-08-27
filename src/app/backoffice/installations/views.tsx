import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  buildBackofficeNextPath,
  type BackofficeSearchParams,
} from "@/lib/backoffice/route";
import { redirect } from "next/navigation";
import { toStatusChangedAtRange, type HistoryDateRange } from "@/lib/backoffice/history-date-range";
import {
  BACKOFFICE_PAGE_SIZE_OPTIONS,
  buildBackofficeTableHref,
  getPageCount,
  normalizeBackofficeTableParams,
} from "@/lib/backoffice/table-controls";
import { listActiveInstallerRequestAssignments } from "@/lib/installation/installer/review";
import { getInstallOrderAmounts } from "@/lib/installation/settlement/order-amounts";
import {
  countInstallationOrderStatuses,
  listInstallationOrderStatuses,
  type InstallationOrderSearchCondition,
  type InstallationOrderStatusView,
} from "@/lib/installation/orders/views/orders";
import AssignmentReviewList, {
  type InstallationAssignmentReviewItem,
} from "./AssignmentReviewList";
import InstallationOrderList, { type InstallationOrderListItem } from "./InstallationOrderList";

type InstallationOrderListViewProps = {
  basePath: string;
  nextPath?: string;
  query: string;
  searchCondition?: InstallationOrderSearchCondition;
  searchParams: BackofficeSearchParams;
  historyDateRange?: HistoryDateRange;
  statusView: InstallationOrderStatusView;
  statusFilterItems?: Array<{ statusView: InstallationOrderStatusView; label: string; href?: string }>;
  title?: string;
  showSearchControls?: boolean;
  showStatusFilters?: boolean;
  requireSearchCondition?: boolean;
  emptyMessage?: string;
};

export async function InstallationOrderListView({
  basePath,
  historyDateRange,
  nextPath,
  query,
  searchCondition,
  searchParams,
  statusView,
  statusFilterItems,
  title,
  showSearchControls,
  showStatusFilters,
  requireSearchCondition = false,
  emptyMessage,
}: InstallationOrderListViewProps) {
  await requireBackofficeUserPage(nextPath ?? buildBackofficeNextPath(basePath, searchParams), 1);

  const tableParams = normalizeBackofficeTableParams(searchParams);
  const statusChangedAtRange = historyDateRange ? toStatusChangedAtRange(historyDateRange) : {};
  const shouldLoadOrders = !requireSearchCondition || Boolean(query || searchCondition);
  const [totalItems, statusFilterCounts] = await Promise.all([
    shouldLoadOrders
      ? countInstallationOrderStatuses({ query, searchCondition, statusView, ...statusChangedAtRange })
      : Promise.resolve(0),
    statusFilterItems?.length
      ? Promise.all(
          statusFilterItems.map(async (item) => ({
            statusView: item.statusView,
            count: await countInstallationOrderStatuses({
              query,
              searchCondition,
              statusView: item.statusView,
              ...statusChangedAtRange,
            }),
          })),
        )
      : Promise.resolve([]),
  ]);
  const totalPages = getPageCount(totalItems, tableParams.pageSize);
  if (tableParams.page > totalPages) {
    redirect(
      buildBackofficeTableHref(basePath, {
        currentParams: searchParams,
        page: totalPages,
        pageSize: tableParams.pageSize,
      }),
    );
  }

  const orders = shouldLoadOrders
    ? await listInstallationOrderStatuses({
        query,
        searchCondition,
        statusView,
        ...statusChangedAtRange,
        limit: tableParams.pageSize,
        offset: tableParams.skip,
      })
    : [];

  // 목록에서 "이 건이 얼마짜리인가"가 바로 보이도록 한 번에 조회한다.
  const settlementAmounts = await getInstallOrderAmounts(orders.map((order) => order.id)).catch(
    (error): Awaited<ReturnType<typeof getInstallOrderAmounts>> => {
      console.error("[backoffice/installations/amounts]", error);
      return new Map();
    },
  );

  const items: InstallationOrderListItem[] = orders.map((order) => {
    const request = order.customerRequests[0] ?? null;
    const assignment = order.assignmentAttempts[0] ?? null;

    return {
      id: order.id,
      installationId: order.id,
      erpOrderNo: order.sourceErpOrderNo,
      channel: order.sourceChannel,
      customerName: order.sourceCustomerName,
      phone: order.sourcePhone,
      sourceAddress: order.sourceAddress,
      itemName: null,
      productSummary: order.sourceMemo,
      sourceItemsJsonText: order.sourceItemsJsonText,
      sourceOrderDate: order.sourceOrderDate,
      status: order.status,
      currentInstallerId: order.currentInstallerId,
      hasOpenIssue: order.hasOpenIssue,
      issueCodes: order.issues.map((issue) => issue.type),
      statusChangedAt: order.statusChangedAt.toISOString(),
      settlementAmount: settlementAmounts.get(order.id) ?? null,
      request: request
        ? {
            id: request.id,
            installAddress: request.installAddress,
            installDate: request.installDate,
            installTimeSlot: request.installTimeSlot,
            customerPhone: request.customerPhone,
            fallbackUsed: request.fallbackUsed,
            status: request.status,
          }
        : null,
      assignment: assignment
        ? {
            id: assignment.id,
            installerId: assignment.installerId,
            installerName: assignment.installer.name,
            installerPhone: assignment.installer.phone,
            installerBranch: assignment.installer.branch,
            assignmentNumber: assignment.assignmentNumber,
            status: assignment.status,
            createdAt: assignment.createdAt.toISOString(),
          }
        : null,
      activeAttempt: assignment
        ? {
            id: assignment.id,
            installerId: assignment.installerId,
            assignmentType: assignment.assignmentSource,
            assignmentStatus: assignment.status,
            createdAt: assignment.createdAt.toISOString(),
          }
        : null,
      customerRequest: request
        ? {
            id: request.id,
            installAddress: request.installAddress,
            installDate: request.installDate,
            installTimeSlot: request.installTimeSlot,
            customerPhone: request.customerPhone,
            fallbackUsed: request.fallbackUsed,
          }
        : null,
    };
  });

  return (
    <InstallationOrderList
      basePath={basePath}
      detailSearchQuery={buildBackofficeNextPath("", searchParams).slice(1)}
      historyDateRange={historyDateRange}
      initialItems={items}
      searchCondition={searchCondition}
      searchQuery={query}
      statusFilterItems={statusFilterItems?.map((item) => ({
        ...item,
        count:
          statusFilterCounts.find((statusFilterCount) => statusFilterCount.statusView === item.statusView)
            ?.count ?? 0,
      }))}
      statusView={statusView}
      title={title}
      showSearchControls={showSearchControls}
      showStatusFilters={showStatusFilters}
      emptyMessage={emptyMessage}
      pagination={buildPaginationModel(basePath, searchParams, tableParams, totalItems, totalPages)}
    />
  );
}

export async function AssignmentReviewsView({ nextPath }: { nextPath: string }) {
  await requireBackofficeUserPage(nextPath, 1);

  const assignments = await listActiveInstallerRequestAssignments();

  const items: InstallationAssignmentReviewItem[] = assignments.map((assignment) => {
    const request = assignment.installationOrder.customerRequests[0] ?? null;

    return {
      id: assignment.id,
      orderId: assignment.installationOrderId,
      customerRequestId: assignment.customerRequestId,
      installerId: assignment.installerId,
      installerName: assignment.installer.branchName,
      installerPhone: assignment.installer.phone,
      assignmentSource: assignment.assignmentSource,
      matchTier: assignment.matchTier,
      candidateRank: assignment.candidateRank,
      createdAt: assignment.createdAt.toISOString(),
      order: {
        erpOrderNo: assignment.installationOrder.sourceErpOrderNo,
        customerName: assignment.installationOrder.sourceCustomerName,
        sourcePhone: assignment.installationOrder.sourcePhone,
        sourceAddress: assignment.installationOrder.sourceAddress,
        status: assignment.installationOrder.status,
      },
      request: request
        ? {
            installAddress: request.installAddress,
            installDate: request.installDate,
            installTimeSlot: request.installTimeSlot,
            customerPhone: request.customerPhone,
            customerNote: request.customerNote,
            fallbackUsed: request.fallbackUsed,
            status: request.status,
          }
        : null,
    };
  });

  return <AssignmentReviewList initialItems={items} />;
}

function buildPaginationModel(
  pathname: string,
  searchParams: BackofficeSearchParams,
  tableParams: ReturnType<typeof normalizeBackofficeTableParams>,
  totalItems: number,
  totalPages: number,
) {
  const page = Math.min(tableParams.page, totalPages);

  return {
    page,
    pageSize: tableParams.pageSize,
    totalItems,
    totalPages,
    pageSizeLinks: BACKOFFICE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
      pageSize,
      href: buildBackofficeTableHref(pathname, {
        currentParams: searchParams,
        page: 1,
        pageSize,
      }),
    })),
    previousHref:
      page > 1
        ? buildBackofficeTableHref(pathname, {
            currentParams: searchParams,
            page: page - 1,
            pageSize: tableParams.pageSize,
          })
        : null,
    nextHref:
      page < totalPages
        ? buildBackofficeTableHref(pathname, {
            currentParams: searchParams,
            page: page + 1,
            pageSize: tableParams.pageSize,
          })
        : null,
  };
}
