"use server";

import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import {
  approveInstallationAssignmentByAdmin,
  InstallationDispatchError,
  retryInstallationOrderAssignmentByAdmin,
} from "@/lib/installation/installer/dispatch";
import {
  cancelInstallationOrder,
  completeInstallationOrder,
  createManualInstallerAssignment,
  InstallationManualOperationError,
  switchInstallationOrderToManualRequired,
} from "@/lib/installation/installer/manual-operations";
import { InstallationIssueResolveError, resolveInstallationIssue } from "@/lib/installation/orders/issues/resolve";
import {
  retrySmsNotification,
  sendInstallationNotificationById,
  SmsNotificationRetryError,
} from "@/lib/installation/notifications/outbox";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import {
  createCustomerInputRequestsForInstallationOrders,
  type CreateCustomerInputRequestsForInstallationOrdersResult,
} from "@/lib/installation/orders/processor";

export type ActiveAssignmentAttemptSnapshot = {
  id: string;
  assignmentType: string;
  assignmentStatus: string;
  smsRetryPending: boolean;
};

export type InstallationActionResult =
  | {
      ok: true;
      status?: string;
      assignmentId?: string | null;
      activeAttempt?: ActiveAssignmentAttemptSnapshot | null;
      reasonCode?: string;
    }
  | { ok: false; error: string; message?: string };
export type RetrySmsNotificationActionResult =
  | { ok: true; notificationId: string; status: string }
  | { ok: false; error: string };
export type ResolveInstallationIssueActionResult =
  | { ok: true; issueId: string; status: string }
  | { ok: false; error: string };
export type SendCustomerInputSmsForInstallationOrdersActionResult =
  | ({ ok: true } & CreateCustomerInputRequestsForInstallationOrdersResult)
  | { ok: false; error: string };
export type ApproveInstallationAssignmentsActionResult =
  | {
      ok: true;
      approvedCount: number;
      failedCount: number;
      failures: Array<{ assignmentId: string; error: string }>;
    }
  | { ok: false; error: string };

type ManualAssignmentInput = {
  installationId: string;
  installerId: string;
  manualReason?: string | null;
};

type InstallationReasonInput = {
  installationId: string;
  reason: string;
};

type RetryInstallationOrderAssignmentByAdminInput = {
  installationId: string;
};

type ApproveInstallationAssignmentInput = {
  assignmentId: string;
};

type ApproveInstallationAssignmentsInput = {
  assignmentIds: string[];
};

type ResolveInstallationIssueInput = {
  issueId: string;
  note: string;
};

type SendCustomerInputSmsForInstallationOrdersInput = {
  installationIds: string[];
};

async function requireInstallationAdmin(): Promise<
  | { ok: true; admin: { id: string } }
  | { ok: false; error: string }
> {
  try {
    const admin = await getCurrentBackofficeUser();
    if (!admin) return { ok: false, error: "UNAUTHORIZED" };
    if (admin.level < 1) return { ok: false, error: "FORBIDDEN" };
    return { ok: true, admin };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AUTH_ERROR" };
  }
}

export async function createManualInstallationAssignmentAction(
  inputOrOrderId: ManualAssignmentInput | string,
  legacyInstallerId?: string,
  legacyManualReason?: string,
): Promise<InstallationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const input =
    typeof inputOrOrderId === "string"
      ? {
          installationId: inputOrOrderId,
          installerId: legacyInstallerId ?? "",
          manualReason: legacyManualReason ?? null,
        }
      : inputOrOrderId;
  const normalizedOrderId = input.installationId.trim();
  const normalizedInstallerId = input.installerId.trim();
  const normalizedManualReason = input.manualReason?.trim() || null;
  if (!normalizedOrderId) return { ok: false, error: "ORDER_ID_REQUIRED" };
  if (!normalizedInstallerId) return { ok: false, error: "INSTALLER_ID_REQUIRED" };

  try {
    const result = await createManualInstallerAssignment(normalizedOrderId, {
      installerId: normalizedInstallerId,
      adminId: auth.admin.id,
      manualReason: normalizedManualReason,
      baseUrl: getSmsLinkBaseUrl(),
    });
    return normalizeAssignmentResult(result, {
      status: "WAITING_INSTALLER_RESPONSE",
      assignmentType: "MANUAL_DIRECT",
    });
  } catch (error) {
    if (error instanceof InstallationManualOperationError) {
      return { ok: false, error: toPublicManualAssignmentError(error.message) };
    }
    console.error("[action/installations/manual-assignment]", error);
    return { ok: false, error: "MANUAL_ASSIGNMENT_FAILED" };
  }
}

export async function approveInstallationAssignmentAction(
  inputOrAssignmentId: ApproveInstallationAssignmentInput | string,
): Promise<InstallationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const input =
    typeof inputOrAssignmentId === "string"
      ? { assignmentId: inputOrAssignmentId }
      : inputOrAssignmentId;
  const normalizedAssignmentId = input.assignmentId.trim();
  if (!normalizedAssignmentId) return { ok: false, error: "ASSIGNMENT_ID_REQUIRED" };

  try {
    const result = await approveInstallationAssignmentByAdmin(normalizedAssignmentId, {
      adminId: auth.admin.id,
      baseUrl: getSmsLinkBaseUrl(),
    });
    return normalizeAssignmentResult(result, {
      status: "WAITING_INSTALLER_RESPONSE",
      assignmentType: "AUTO",
    });
  } catch (error) {
    if (error instanceof InstallationDispatchError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/approve-assignment]", error);
    return { ok: false, error: "ASSIGNMENT_APPROVAL_FAILED" };
  }
}

export async function approveInstallationAssignmentsAction(
  input: ApproveInstallationAssignmentsInput,
): Promise<ApproveInstallationAssignmentsActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const assignmentIds = Array.from(
    new Set(input.assignmentIds.map((assignmentId) => assignmentId.trim()).filter(Boolean)),
  );
  if (assignmentIds.length === 0) return { ok: false, error: "ASSIGNMENT_IDS_REQUIRED" };

  const failures: Array<{ assignmentId: string; error: string }> = [];
  let approvedCount = 0;

  for (const assignmentId of assignmentIds) {
    try {
      await approveInstallationAssignmentByAdmin(assignmentId, {
        adminId: auth.admin.id,
        baseUrl: getSmsLinkBaseUrl(),
      });
      approvedCount += 1;
    } catch (error) {
      if (error instanceof InstallationDispatchError) {
        failures.push({ assignmentId, error: error.message });
      } else {
        console.error("[action/installations/bulk-approve-assignment]", { assignmentId, error });
        failures.push({ assignmentId, error: "ASSIGNMENT_APPROVAL_FAILED" });
      }
    }
  }

  return {
    ok: true,
    approvedCount,
    failedCount: failures.length,
    failures,
  };
}

function toPublicManualAssignmentError(error: string) {
  const errorMap: Record<string, string> = {
    ORDER_NOT_MANUAL_ASSIGNABLE: "INSTALLATION_NOT_ATTENTION_REQUIRED",
    INSTALLER_NOT_ACTIVE: "INSTALLER_INACTIVE",
    INSTALLER_CAPABILITY_NOT_MATCHED: "INSTALLER_CAPABILITY_NOT_MET",
    INSTALLER_AQARA_CAPABILITY_NOT_MATCHED: "AQARA_APP_CAPABILITY_NOT_MET",
    MANUAL_ASSIGNMENT_REASON_REQUIRED: "MANUAL_REASON_REQUIRED_FOR_REGION_MISMATCH",
  };

  return errorMap[error] ?? error;
}

export async function cancelInstallationOrderAction(
  inputOrOrderId: InstallationReasonInput | string,
  legacyReason?: string,
): Promise<InstallationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const input =
    typeof inputOrOrderId === "string"
      ? { installationId: inputOrOrderId, reason: legacyReason ?? "" }
      : inputOrOrderId;
  const normalizedOrderId = input.installationId.trim();
  const normalizedReason = input.reason.trim();
  if (!normalizedOrderId) return { ok: false, error: "ORDER_ID_REQUIRED" };
  if (!normalizedReason) return { ok: false, error: "CANCEL_REASON_REQUIRED" };

  try {
    await cancelInstallationOrder(normalizedOrderId, {
      adminId: auth.admin.id,
      reason: normalizedReason,
    });
    return { ok: true, status: "CANCELLED" };
  } catch (error) {
    if (error instanceof InstallationManualOperationError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/cancel]", error);
    return { ok: false, error: "ORDER_CANCELLATION_FAILED" };
  }
}

export async function switchInstallationOrderToManualRequiredAction(
  inputOrOrderId: InstallationReasonInput | string,
  legacyReason?: string,
): Promise<InstallationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const input =
    typeof inputOrOrderId === "string"
      ? { installationId: inputOrOrderId, reason: legacyReason ?? "" }
      : inputOrOrderId;
  const normalizedOrderId = input.installationId.trim();
  const normalizedReason = input.reason.trim();
  if (!normalizedOrderId) return { ok: false, error: "ORDER_ID_REQUIRED" };
  if (!normalizedReason) return { ok: false, error: "MANUAL_SWITCH_REASON_REQUIRED" };

  try {
    await switchInstallationOrderToManualRequired(normalizedOrderId, {
      adminId: auth.admin.id,
      reason: normalizedReason,
    });
    return { ok: true, status: "ATTENTION_REQUIRED" };
  } catch (error) {
    if (error instanceof InstallationManualOperationError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/manual-switch]", error);
    return { ok: false, error: "MANUAL_SWITCH_FAILED" };
  }
}

export async function completeInstallationOrderAction(
  inputOrOrderId: InstallationReasonInput | string,
  legacyReason?: string,
): Promise<InstallationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const input =
    typeof inputOrOrderId === "string"
      ? { installationId: inputOrOrderId, reason: legacyReason ?? "" }
      : inputOrOrderId;
  const normalizedOrderId = input.installationId.trim();
  const normalizedReason = input.reason.trim();
  if (!normalizedOrderId) return { ok: false, error: "ORDER_ID_REQUIRED" };
  if (!normalizedReason) return { ok: false, error: "COMPLETION_REASON_REQUIRED" };

  try {
    await completeInstallationOrder(normalizedOrderId, {
      adminId: auth.admin.id,
      reason: normalizedReason,
    });
    return { ok: true, status: "COMPLETED" };
  } catch (error) {
    if (error instanceof InstallationManualOperationError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/complete]", error);
    return { ok: false, error: "ORDER_COMPLETION_FAILED" };
  }
}

export async function retryInstallationOrderAssignmentByAdminAction(
  inputOrOrderId: RetryInstallationOrderAssignmentByAdminInput | string,
  legacyReason = "관리자 기사 후보 다시 찾기",
): Promise<InstallationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const input =
    typeof inputOrOrderId === "string"
      ? { installationId: inputOrOrderId }
      : inputOrOrderId;
  const normalizedOrderId = input.installationId.trim();
  const normalizedReason = legacyReason.trim() || "관리자 기사 후보 다시 찾기";
  if (!normalizedOrderId) return { ok: false, error: "ORDER_ID_REQUIRED" };
  if (!normalizedReason) return { ok: false, error: "ADMIN_RETRY_REASON_REQUIRED" };

  try {
    const result = await retryInstallationOrderAssignmentByAdmin(normalizedOrderId, {
      adminId: auth.admin.id,
      reason: normalizedReason,
      baseUrl: getSmsLinkBaseUrl(),
    });
    return normalizeAssignmentResult(result, {
      status: "WAITING_ADMIN_REVIEW",
      assignmentType: "ADMIN_RETRY",
    });
  } catch (error) {
    if (error instanceof InstallationDispatchError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/admin-retry]", error);
    return { ok: false, error: "ADMIN_RETRY_FAILED" };
  }
}

function normalizeAssignmentResult(
  result: unknown,
  fallback: { status: string; assignmentType: string },
): InstallationActionResult {
  if (isAssignmentActionResult(result)) {
    if (!result.assignmentId && result.reasonCode === "DUPLICATE_INSTALLER_REQUEST") {
      return { ok: false, error: "DUPLICATE_INSTALLER_REQUEST" };
    }
    return { ok: true, ...result };
  }

  return {
    ok: true,
    assignmentId: null,
    status: fallback.status,
    activeAttempt: null,
  };
}

function isAssignmentActionResult(value: unknown): value is {
  assignmentId: string | null;
  status: string;
  activeAttempt: ActiveAssignmentAttemptSnapshot | null;
  reasonCode?: string;
} {
  return typeof value === "object" && value !== null && "status" in value;
}

export async function retrySmsNotificationAction(
  notificationId: string,
): Promise<RetrySmsNotificationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const normalizedNotificationId = notificationId.trim();
  if (!normalizedNotificationId) return { ok: false, error: "NOTIFICATION_ID_REQUIRED" };

  try {
    const notification = await retrySmsNotification(normalizedNotificationId);
    return {
      ok: true,
      notificationId: notification.id,
      status: notification.status,
    };
  } catch (error) {
    if (error instanceof SmsNotificationRetryError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/retry-sms]", error);
    return { ok: false, error: "SMS_NOTIFICATION_RETRY_FAILED" };
  }
}

export async function sendSmsNotificationAction(
  notificationId: string,
): Promise<RetrySmsNotificationActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const normalizedNotificationId = notificationId.trim();
  if (!normalizedNotificationId) return { ok: false, error: "NOTIFICATION_ID_REQUIRED" };

  try {
    const notification = await sendInstallationNotificationById(normalizedNotificationId);
    return {
      ok: true,
      notificationId: notification.id,
      status: notification.status,
    };
  } catch (error) {
    if (error instanceof SmsNotificationRetryError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/send-sms]", error);
    return { ok: false, error: "SMS_NOTIFICATION_SEND_FAILED" };
  }
}

export async function sendCustomerInputSmsForInstallationOrdersAction(
  input: SendCustomerInputSmsForInstallationOrdersInput,
): Promise<SendCustomerInputSmsForInstallationOrdersActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const installationIds = Array.from(
    new Set(input.installationIds.map((installationId) => installationId.trim()).filter(Boolean)),
  );
  if (installationIds.length === 0) return { ok: false, error: "ORDER_IDS_REQUIRED" };

  try {
    const result = await createCustomerInputRequestsForInstallationOrders({
      orderIds: installationIds,
      baseUrl: getSmsLinkBaseUrl(),
    });
    return { ok: true, ...result };
  } catch (error) {
    console.error("[action/installations/customer-input-sms]", error);
    return { ok: false, error: "CUSTOMER_INPUT_SMS_QUEUE_FAILED" };
  }
}

export async function resolveInstallationIssueAction(
  input: ResolveInstallationIssueInput,
): Promise<ResolveInstallationIssueActionResult> {
  const auth = await requireInstallationAdmin();
  if (!auth.ok) return auth;

  const normalizedIssueId = input.issueId.trim();
  const normalizedNote = input.note.trim();
  if (!normalizedIssueId) return { ok: false, error: "ISSUE_ID_REQUIRED" };
  if (!normalizedNote) return { ok: false, error: "RESOLUTION_NOTE_REQUIRED" };

  try {
    const issue = await resolveInstallationIssue(normalizedIssueId, {
      adminId: auth.admin.id,
      note: normalizedNote,
    });
    return {
      ok: true,
      issueId: issue.id,
      status: issue.status,
    };
  } catch (error) {
    if (error instanceof InstallationIssueResolveError) {
      return { ok: false, error: error.message };
    }
    console.error("[action/installations/resolve-issue]", error);
    return { ok: false, error: "INSTALLATION_ISSUE_RESOLVE_FAILED" };
  }
}
