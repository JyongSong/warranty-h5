import { buildBackofficeNextPath, type BackofficeSearchParams } from "@/lib/backoffice/route";
import type { InstallationOrderStatusView } from "@/lib/installation/orders/views/orders";
import { redirect } from "next/navigation";
import { InstallationOrderListView } from "./views";

interface PageProps {
  searchParams: Promise<
    BackofficeSearchParams & {
      lazy?: string | string[];
    }
  >;
}

export default async function InstallationOrdersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  if (resolvedSearchParams.lazy === "true") {
    await sleep(5_000);
  }

  const statusView = normalizeInstallationOrderStatusView(resolvedSearchParams.statusView);
  const requestedStatusView = getSingleSearchParam(resolvedSearchParams.statusView);
  if (requestedStatusView !== statusView) {
    redirect(
      buildBackofficeNextPath(
        "/backoffice/installations",
        normalizeInstallationOrderReturnSearchParams(resolvedSearchParams, statusView),
      ),
    );
  }

  const tableSearchParams = normalizeInstallationOrderTableSearchParams(resolvedSearchParams, statusView);
  const nextPath = buildBackofficeNextPath(
    "/backoffice/installations",
    normalizeInstallationOrderReturnSearchParams(resolvedSearchParams, statusView),
  );

  const statusFilterItems: Array<{ statusView: InstallationOrderStatusView; label: string }> = [
    { statusView: "active", label: "전체 진행 중" },
    { statusView: "attention", label: "처리 필요/예외" },
    { statusView: "attentionCustomerInputSmsRequired", label: "고객 문자 발송 필요" },
    { statusView: "attentionAdminReview", label: "배정 승인 대기" },
    { statusView: "attentionIssueOnly", label: "예외 이슈" },
    { statusView: "customerInputSmsRequired", label: "고객 문자 발송 필요" },
    { statusView: "waitingCustomerInput", label: "고객 입력 대기" },
    { statusView: "preAssignment", label: "기사 배정 전" },
    { statusView: "waitingAdminReview", label: "배정 승인 대기" },
    { statusView: "waitingInstallerResponse", label: "기사 응답 대기" },
    { statusView: "assigned", label: "기사 배정 완료" },
    { statusView: "waitingHqReview", label: "완료 검수 대기" },
    { statusView: "completed", label: "설치 완료" },
  ];

  return (
    <InstallationOrderListView
      basePath="/backoffice/installations"
      query=""
      searchCondition={undefined}
      nextPath={nextPath}
      searchParams={tableSearchParams}
      showSearchControls={false}
      statusFilterItems={statusFilterItems}
      statusView={statusView}
      title="설치 업무 큐"
    />
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeInstallationOrderTableSearchParams(
  searchParams: BackofficeSearchParams,
  statusView: InstallationOrderStatusView,
) {
  const tableSearchParams: BackofficeSearchParams = { ...searchParams };
  delete tableSearchParams.lazy;
  delete tableSearchParams.view;
  delete tableSearchParams.mock;
  delete tableSearchParams.raw;
  delete tableSearchParams.q;
  delete tableSearchParams.searchField;
  delete tableSearchParams.searchKeyword;
  delete tableSearchParams.searchFrom;
  delete tableSearchParams.searchTo;
  delete tableSearchParams.from;
  delete tableSearchParams.to;
  tableSearchParams.statusView = statusView;
  return tableSearchParams;
}

function normalizeInstallationOrderReturnSearchParams(
  searchParams: BackofficeSearchParams,
  statusView: InstallationOrderStatusView,
) {
  const returnSearchParams: BackofficeSearchParams = { ...searchParams };
  delete returnSearchParams.lazy;
  delete returnSearchParams.view;
  delete returnSearchParams.mock;
  delete returnSearchParams.raw;
  delete returnSearchParams.q;
  delete returnSearchParams.searchField;
  delete returnSearchParams.searchKeyword;
  delete returnSearchParams.searchFrom;
  delete returnSearchParams.searchTo;
  delete returnSearchParams.from;
  delete returnSearchParams.to;
  returnSearchParams.statusView = statusView;
  return returnSearchParams;
}

function normalizeInstallationOrderStatusView(value: string | string[] | undefined): InstallationOrderStatusView {
  const statusView = getSingleSearchParam(value);
  if (
    statusView === "active" ||
    statusView === "attention" ||
    statusView === "attentionCustomerInputSmsRequired" ||
    statusView === "attentionAdminReview" ||
    statusView === "attentionIssueOnly" ||
    statusView === "customerInputSmsRequired" ||
    statusView === "waitingCustomerInput" ||
    statusView === "preAssignment" ||
    statusView === "waitingAdminReview" ||
    statusView === "waitingInstallerResponse" ||
    statusView === "assigned" ||
    statusView === "waitingHqReview" ||
    statusView === "completed"
  ) {
    return statusView;
  }

  return "active";
}

function getSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}
