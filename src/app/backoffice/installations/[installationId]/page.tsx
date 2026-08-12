/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  buildBackofficeNextPath,
  type BackofficeSearchParams,
} from "@/lib/backoffice/route";
import {
  findBestMatchingInstallers,
  type InstallationOrderInstaller,
} from "@/lib/installation/installer/matcher";
import {
  listDispatchCandidateInstallers,
  type DispatchCandidateInstaller,
} from "@/lib/installation/installer/source";
import { parseRequiredCapabilitiesText } from "@/lib/installation/orders/source/source-items";
import { getInstallationOrderStatusDetail } from "@/lib/installation/orders/views/detail";
import { getInstallationCompletionForOrder } from "@/lib/installation/completion/service";
import InstallationOrderDetail, { type InstallationOrderDetailItem } from "./InstallationOrderDetail";
import CompletionReviewPanel from "./CompletionReviewPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ installationId: string }>;
  searchParams: Promise<BackofficeSearchParams>;
};

export default async function InstallationOrderDetailPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return renderInstallationOrderDetailPage({
    installationId: resolvedParams.installationId,
    searchParams: resolvedSearchParams,
    basePath: "/backoffice/installations",
  });
}

export async function renderInstallationOrderDetailPage({
  installationId,
  searchParams,
  basePath,
  displayMode = "page",
}: {
  installationId: string;
  searchParams: BackofficeSearchParams;
  basePath: string;
  displayMode?: "page" | "panel";
}) {
  await requireBackofficeUserPage(
    buildBackofficeNextPath(
      `${basePath}/${installationId}`,
      searchParams,
    ),
    1,
  );

  const order = await getInstallationOrderStatusDetail(installationId);

  if (!order) {
    notFound();
  }

  const completion = await getInstallationCompletionForOrder(installationId);

  const requiredCapabilities = parseRequiredCapabilitiesText(order.requiredCapabilities);
  const requiredAqaraAppCapability = order.requiredAqaraAppCapability ?? "NONE";
  const activeRequest =
    order.customerRequests.find((request: any) => request.id === order.activeCustomerRequestId) ??
    order.customerRequests[0] ??
    null;
  const dispatchInstallers = await listDispatchCandidateInstallers({
    requiredCapabilities,
    requiredAqaraAppCapability,
  });
  const matchedInstallers = activeRequest?.installAddress
    ? findBestMatchingInstallers(activeRequest.installAddress, dispatchInstallers)
    : [];
  const matchedInstallerById = new Map(
    matchedInstallers.map((installer) => [installer.businessNumber, installer]),
  );
  const installerCandidates = matchedInstallers.map((candidate, index) =>
    toInstallerCandidateItem(candidate, index + 1),
  );
  const manualAssignmentInstallers = dispatchInstallers.map((installer, index) =>
    toInstallerCandidateItem(
      withMatchedTier(installer, matchedInstallerById.get(installer.businessNumber)?.matchTier),
      index + 1,
    ),
  );
  const candidateRuns = order.candidateRuns.map((run: any) => ({
    id: run.id,
    reasonCode: run.reasonCode,
    createdAt: run.createdAt.toISOString(),
    candidates: run.candidates.map((candidate: any) => ({
      installerId: candidate.installerId,
      installerName: candidate.installer.name,
      installerBranch: candidate.installer.branch,
      rank: candidate.rank,
      isAutoRequestCandidate: candidate.isAutoRequestCandidate,
      regionTier: candidate.regionTier,
      monthlyDispatchCount: candidate.monthlyDispatchCount,
      lastRequestedAt: candidate.lastRequestedAt?.toISOString() ?? null,
      excludedReason: candidate.excludedReason,
      decisionReason: candidate.decisionReason,
    })),
  }));
  const assignmentInstallerById = new Map(
    order.assignmentAttempts.map((assignment) => [assignment.id, assignment.installer]),
  );

  const statusEvents = order.statusEvents.map((event) => ({
    ...event,
    metadata: event.metadata as Record<string, unknown> | null,
    createdAt: event.createdAt.toISOString(),
  }));
  const issues = order.issues.map((issue: any) => ({
    ...issue,
    code: issue.type,
    resolvedAt: issue.resolvedAt ? issue.resolvedAt.toISOString() : null,
    createdAt: issue.createdAt.toISOString(),
  }));

  const item: InstallationOrderDetailItem = {
    ...order,
    requiredCapabilities,
    requiredAqaraAppCapability,
    installerCandidates,
    manualAssignmentInstallers,
    candidateRuns,
    statusChangedAt: order.statusChangedAt.toISOString(),
    customerRequests: order.customerRequests.map((request: any) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    })),
    assignmentAttempts: order.assignmentAttempts.map((assignment: any) => ({
      ...assignment,
      installerName: assignment.installer.name,
      installerBranch: assignment.installer.branch,
      acceptedAt: assignment.acceptedAt?.toISOString() ?? null,
      happycallDueAt: assignment.acceptedAt
        ? new Date(assignment.acceptedAt.getTime() + 48 * 60 * 60 * 1000).toISOString()
        : null,
      rejectedAt: assignment.rejectedAt?.toISOString() ?? null,
      timedOutAt: assignment.timedOutAt?.toISOString() ?? null,
      createdAt: assignment.createdAt.toISOString(),
    })),
    statusEvents,
    auditEvents: statusEvents,
    issues,
    smsNotifications: order.notifications.map((notification) => {
      const recipientInstaller = notification.assignmentAttemptId
        ? assignmentInstallerById.get(notification.assignmentAttemptId)
        : null;

      return {
        id: notification.id,
        businessEvent: notification.smsType,
        recipientType: notification.recipientType,
        recipientName: notification.recipientType === "INSTALLER" ? recipientInstaller?.name ?? null : null,
        recipientBranch: notification.recipientType === "INSTALLER" ? recipientInstaller?.branch ?? null : null,
        recipientPhone: notification.recipientPhone,
        status: notification.status,
        providerStatus: notification.providerStatus,
        providerStatusCode: notification.providerStatusCode,
        providerReason: notification.providerReason,
        providerReportedAt: notification.providerReportedAt?.toISOString() ?? null,
        providerCheckedAt: notification.providerCheckedAt?.toISOString() ?? null,
        retryable: notification.status === "FAILED",
        failureReason: notification.errorMessage ?? notification.errorCode,
        retryCount: notification.retryCount,
        deliveryCheckCount: notification.deliveryCheckCount,
        sentAt: notification.sentAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      };
    }),
  };

  return (
    <>
      {completion ? (
        <CompletionReviewPanel
          orderId={installationId}
          orderStatus={order.status}
          requiredAqaraAppCapability={requiredAqaraAppCapability}
          completion={completion}
        />
      ) : null}
      <InstallationOrderDetail
        item={item}
        returnPath={buildBackofficeNextPath(basePath, searchParams)}
        displayMode={displayMode}
      />
    </>
  );
}

function withMatchedTier(
  installer: DispatchCandidateInstaller,
  matchTier: InstallationOrderInstaller["matchTier"] | undefined,
) {
  return matchTier ? { ...installer, matchTier } : installer;
}

function toInstallerCandidateItem(candidate: InstallationOrderInstaller, rank: number) {
  const installer = candidate as DispatchCandidateInstaller;
  return {
    rank,
    installerId: installer.businessNumber,
    installerName: installer.branchName,
    installerBranch: installer.branchName,
    phone: installer.phone,
    region: installer.installationRegion,
    serviceAreas: installer.serviceAreas ?? [],
    monthlyDispatchCount: installer.monthlyDispatchCount ?? 0,
    matchTier: installer.matchTier ?? null,
    hasAqaraHubInventory: installer.hasAqaraHubInventory ?? false,
  };
}
