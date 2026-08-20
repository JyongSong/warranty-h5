import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { getInstallationSmsSubject } from "@/lib/installation/notifications/sms-content";
import {
  ALIMTALK_TEMPLATES,
  type AlimtalkRequest,
  type AlimtalkTemplateKey,
} from "@/lib/notifications/alimtalk";
import {
  getInstallationSmsDeliveryReport as defaultGetDeliveryReport,
  sendInstallationSmsOrThrow as defaultSendSms,
  type InstallationSmsDeliveryReport,
  type SendInstallationSmsOptions,
} from "@/lib/installation/notifications/sms-sender";

type SendSmsResult = {
  providerMessageId?: string | null;
};

type SendSms = (
  to: string | null | undefined,
  text: string,
  options?: SendInstallationSmsOptions
) => Promise<SendSmsResult | void>;

type GetDeliveryReport = (messageId: string) => Promise<InstallationSmsDeliveryReport | null>;

type SendPendingInstallationNotificationsOptions = {
  limit?: number;
  now?: Date;
  sendSms?: SendSms;
};

export type SendPendingInstallationNotificationsResult = {
  sentCount: number;
  failedCount: number;
};

export type SyncInstallationSmsDeliveryReportsResult = {
  checkedCount: number;
  updatedCount: number;
  deliveryFailedCount: number;
  failedCount: number;
};

type InstallationNotificationForSend = {
  id: string;
  installationOrderId: string | null;
  customerRequestId?: string | null;
  assignmentAttemptId: string | null;
  smsType: string;
  recipientPhoneEncrypted: string | null;
  smsBody: string;
  retryCount: number;
};

type InstallationNotificationForDeliveryReport = {
  id: string;
  installationOrderId: string | null;
  assignmentAttemptId: string | null;
  smsType: string;
  recipientPhoneEncrypted: string | null;
  retryCount: number;
  deliveryCheckCount?: number;
  providerMessageId: string | null;
};

type InstallationNotificationForFailure = {
  id: string;
  installationOrderId: string | null;
  assignmentAttemptId: string | null;
  smsType: string;
  recipientPhoneEncrypted: string | null;
};

/**
 * 알림 행에 저장해 둔 템플릿/변수를 알림톡 요청으로 되살린다.
 * outbox 는 발송 시점에 돌기 때문에 생성 시점의 변수 값을 그대로 써야 한다.
 * 컬럼이 비어 있거나 레지스트리에 없는 키면 SMS 로만 나간다.
 */
function toAlimtalkRequest(notification: {
  alimtalkTemplateKey: string | null;
  alimtalkVariables: unknown;
}): AlimtalkRequest | undefined {
  const templateKey = notification.alimtalkTemplateKey;
  if (!templateKey || !(templateKey in ALIMTALK_TEMPLATES)) return undefined;

  const stored = notification.alimtalkVariables;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;

  const variables: Record<string, string | null> = {};
  for (const [name, value] of Object.entries(stored as Record<string, unknown>)) {
    variables[name] = typeof value === "string" ? value : null;
  }

  return { templateKey: templateKey as AlimtalkTemplateKey, variables };
}

export async function sendPendingInstallationNotifications({
  limit = 25,
  now = new Date(),
  sendSms = defaultSendSms,
}: SendPendingInstallationNotificationsOptions = {}): Promise<SendPendingInstallationNotificationsResult> {
  const notifications = await prisma.installationNotification.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const notification of notifications) {
    let providerAccepted = false;
    try {
      if (await skipStaleNotification(notification)) {
        failedCount += 1;
        continue;
      }
      const sendResult = await sendSms(
        decryptNullablePii(notification.recipientPhoneEncrypted),
        notification.smsBody,
        {
          subject: getInstallationSmsSubject(notification.smsTemplateKey),
          alimtalk: toAlimtalkRequest(notification),
        },
      );
      providerAccepted = true;
      await prisma.installationNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          provider: "solapi",
          providerMessageId: sendResult?.providerMessageId ?? null,
          providerStatus: null,
          providerStatusCode: null,
          providerReason: null,
          providerReportedAt: null,
          providerCheckedAt: null,
          deliveryCheckCount: 0,
          sentAt: now,
          errorCode: null,
          errorMessage: null,
        },
      });
      await runPostSendNotificationEffects(notification, now);
      sentCount += 1;
    } catch (error) {
      const retryCount = notification.retryCount + 1;
      const errorMessage = getErrorMessage(error);
      if (providerAccepted) {
        await handleUnknownSmsSendOutcome(notification, retryCount, errorMessage, now);
        failedCount += 1;
        continue;
      }
      const shouldRetrySend = retryCount < MAX_SMS_SEND_ATTEMPTS;
      await prisma.installationNotification.update({
        where: { id: notification.id },
        data: {
          status: shouldRetrySend ? "PENDING" : "FAILED",
          retryCount,
          errorCode: "SMS_FAILED",
          errorMessage,
        },
      });
      if (
        notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
        notification.assignmentAttemptId
      ) {
        await handleAssignmentRequestSmsFailure(notification, {
          retryCount,
          errorMessage,
          now,
        });
      } else if (!shouldRetrySend && notification.installationOrderId) {
        await createSmsFailedIssue(notification, retryCount, errorMessage, now);
      }
      failedCount += 1;
    }
  }

  return { sentCount, failedCount };
}

export async function syncInstallationSmsDeliveryReports({
  limit = 25,
  now = new Date(),
  minSentAgeMs = 2 * 60 * 1000,
  minCheckIntervalMs = 10 * 60 * 1000,
  getDeliveryReport = defaultGetDeliveryReport,
}: {
  limit?: number;
  now?: Date;
  minSentAgeMs?: number;
  minCheckIntervalMs?: number;
  getDeliveryReport?: GetDeliveryReport;
} = {}): Promise<SyncInstallationSmsDeliveryReportsResult> {
  const sentBefore = new Date(now.getTime() - minSentAgeMs);
  const checkedBefore = new Date(now.getTime() - minCheckIntervalMs);
  const notifications = await prisma.installationNotification.findMany({
    where: {
      status: "SENT",
      providerMessageId: { not: null },
      sentAt: { lt: sentBefore },
      OR: [
        { providerCheckedAt: null },
        { providerCheckedAt: { lt: checkedBefore } },
      ],
    },
    orderBy: [
      { providerCheckedAt: "asc" },
      { sentAt: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      installationOrderId: true,
      assignmentAttemptId: true,
      smsType: true,
      recipientPhoneEncrypted: true,
      retryCount: true,
      deliveryCheckCount: true,
      providerMessageId: true,
    },
  });

  let checkedCount = 0;
  let updatedCount = 0;
  let deliveryFailedCount = 0;
  let failedCount = 0;

  for (const notification of notifications as InstallationNotificationForDeliveryReport[]) {
    if (!notification.providerMessageId) continue;

    let report: InstallationSmsDeliveryReport | null;
    try {
      report = await getDeliveryReport(notification.providerMessageId);
      checkedCount += 1;
    } catch (error) {
      failedCount += 1;
      try {
        await handleDeliveryReportLookupFailure(notification, error, now);
      } catch (recordError) {
        console.error("[installation/notification/delivery-report-record]", recordError);
      }
      console.error("[installation/notification/delivery-report]", error);
      continue;
    }

    try {
      const deliveryFailed = isProviderDeliveryFailure(report);
      const deliveryUnconfirmed = !deliveryFailed && !isProviderDeliverySuccess(report);
      const retryCount = notification.retryCount + 1;
      const deliveryCheckCount = deliveryUnconfirmed
        ? (notification.deliveryCheckCount ?? 0) + 1
        : 0;
      const shouldRetryDelivery =
        deliveryFailed &&
        retryCount < MAX_SMS_DELIVERY_ATTEMPTS;
      const shouldRetryConfirmation =
        deliveryUnconfirmed &&
        deliveryCheckCount < MAX_SMS_DELIVERY_ATTEMPTS;
      const errorMessage = deliveryFailed
        ? formatDeliveryFailureMessage(report)
        : deliveryUnconfirmed
          ? "SMS_DELIVERY_STATUS_UNCONFIRMED"
          : null;
      const statusUpdate = deliveryFailed
        ? {
            status: shouldRetryDelivery ? "PENDING" as const : "FAILED" as const,
            retryCount,
            errorCode: "SMS_DELIVERY_FAILED",
            errorMessage,
          }
        : deliveryUnconfirmed
          ? {
              status: shouldRetryConfirmation ? "SENT" as const : "FAILED" as const,
              errorCode: "SMS_DELIVERY_STATUS_UNCONFIRMED",
              errorMessage,
            }
          : {
              status: "DELIVERED" as const,
              errorCode: null,
              errorMessage: null,
            };

      await prisma.installationNotification.update({
        where: { id: notification.id },
        data: {
          providerStatus: report?.status ?? null,
          providerStatusCode: report?.statusCode ?? null,
          providerReason: report?.reason ?? null,
          providerReportedAt: parseProviderDate(report?.dateReported),
          providerCheckedAt: now,
          deliveryCheckCount,
          ...statusUpdate,
        },
      });
      updatedCount += 1;

      if (deliveryFailed) {
        const normalizedErrorMessage = errorMessage ?? "SMS_DELIVERY_FAILED";
        if (
          notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
          notification.assignmentAttemptId
        ) {
          await handleAssignmentRequestSmsFailure(notification, {
            retryCount,
            errorMessage: normalizedErrorMessage,
            maxAttempts: MAX_SMS_DELIVERY_ATTEMPTS,
            now,
          });
        } else if (shouldRetryDelivery) {
          // Keep the existing business target and let the next dispatcher cycle resend it.
        } else if (notification.installationOrderId) {
          await createSmsDeliveryFailedIssue(
            notification,
            retryCount,
            normalizedErrorMessage,
            report,
            now,
          );
        }
        deliveryFailedCount += 1;
      } else if (deliveryUnconfirmed && !shouldRetryConfirmation) {
        const normalizedErrorMessage = errorMessage ?? "SMS_DELIVERY_STATUS_UNCONFIRMED";
        if (
          notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
          notification.assignmentAttemptId
        ) {
          await handleAssignmentRequestSmsFailure(notification, {
            retryCount: deliveryCheckCount,
            errorMessage: normalizedErrorMessage,
            maxAttempts: MAX_SMS_DELIVERY_ATTEMPTS,
            now,
          });
        } else if (notification.installationOrderId) {
          await createSmsDeliveryFailedIssue(
            notification,
            deliveryCheckCount,
            normalizedErrorMessage,
            report,
            now,
          );
        }
        deliveryFailedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error("[installation/notification/delivery-report-processing]", error);
      if (notification.installationOrderId) {
        try {
          await createInstallationIssue({
            installationOrderId: notification.installationOrderId,
            type: "INSTALLATION_AUTOMATION_FAILED",
            title: "SMS 도달 결과 반영 실패",
            description: getErrorMessage(error),
            metadata: {
              stage: "SMS_DELIVERY_REPORT_PROCESSING",
              notificationId: notification.id,
              providerMessageId: notification.providerMessageId,
            },
            now,
          });
        } catch (issueError) {
          console.error("[installation/notification/delivery-report-issue]", issueError);
        }
      }
    }
  }

  return { checkedCount, updatedCount, deliveryFailedCount, failedCount };
}

async function handleDeliveryReportLookupFailure(
  notification: InstallationNotificationForDeliveryReport,
  error: unknown,
  now: Date,
) {
  const deliveryCheckCount = (notification.deliveryCheckCount ?? 0) + 1;
  const shouldRetryConfirmation = deliveryCheckCount < MAX_SMS_DELIVERY_ATTEMPTS;
  const errorMessage = getErrorMessage(error);
  await prisma.installationNotification.update({
    where: { id: notification.id },
    data: {
      status: shouldRetryConfirmation ? "SENT" : "FAILED",
      deliveryCheckCount,
      providerCheckedAt: now,
      errorCode: "SMS_DELIVERY_REPORT_API_FAILED",
      errorMessage,
    },
  });
  if (shouldRetryConfirmation) return;

  if (
    notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
    notification.assignmentAttemptId
  ) {
    await handleAssignmentRequestSmsFailure(notification, {
      retryCount: deliveryCheckCount,
      errorMessage,
      maxAttempts: MAX_SMS_DELIVERY_ATTEMPTS,
      now,
    });
  } else if (notification.installationOrderId) {
    await createSmsDeliveryFailedIssue(
      notification,
      deliveryCheckCount,
      errorMessage,
      null,
      now,
    );
  }
}

export async function sendInstallationNotificationById(
  notificationId: string,
  {
    now = new Date(),
    sendSms = defaultSendSms,
  }: { now?: Date; sendSms?: SendSms } = {},
) {
  const notification = await prisma.installationNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      installationOrderId: true,
      assignmentAttemptId: true,
      smsType: true,
      customerRequestId: true,
      recipientPhoneEncrypted: true,
      smsBody: true,
      retryCount: true,
      status: true,
      sentAt: true,
    },
  });

  if (!notification) {
    throw new SmsNotificationRetryError("NOTIFICATION_NOT_FOUND");
  }
  if (notification.status === "SENT" || notification.sentAt) {
    return { id: notification.id, status: "SENT" as const };
  }

  if (await skipStaleNotification(notification as InstallationNotificationForSend)) {
    throw new SmsNotificationRetryError("STALE_NOTIFICATION_SKIPPED");
  }

  await sendOneInstallationNotification(notification as InstallationNotificationForSend, {
    now,
    sendSms,
  });

  return { id: notification.id, status: "SENT" as const };
}

export async function retrySmsNotification(
  notificationId: string,
  { now = new Date() }: { now?: Date } = {},
) {
  const notification = await prisma.installationNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      installationOrderId: true,
      customerRequestId: true,
      assignmentAttemptId: true,
      smsType: true,
      recipientType: true,
      recipientPhoneEncrypted: true,
      recipientPhoneHash: true,
      smsTemplateKey: true,
      smsBody: true,
      provider: true,
      status: true,
      sentAt: true,
    },
  });

  if (!notification) {
    throw new SmsNotificationRetryError("NOTIFICATION_NOT_FOUND");
  }
  if (notification.status === "SENT" || notification.sentAt) {
    return createManualResendNotification(notification, now);
  }

  const retryTarget = await findRetryTargetNotification(notification);

  return prisma.installationNotification.update({
    where: { id: retryTarget.id },
    data: {
      status: "PENDING",
      errorCode: null,
      errorMessage: null,
    },
    select: {
      id: true,
      status: true,
    },
  });
}

async function createManualResendNotification(
  notification: {
    id: string;
    installationOrderId: string | null;
    customerRequestId: string | null;
    assignmentAttemptId: string | null;
    smsType: string;
    recipientType: string;
    recipientPhoneEncrypted: string | null;
    recipientPhoneHash: string | null;
    smsTemplateKey: string | null;
    smsBody: string;
    provider: string;
  },
  now: Date,
) {
  if (!notification.installationOrderId) {
    throw new SmsNotificationRetryError("NOTIFICATION_RESEND_NOT_SUPPORTED");
  }

  return prisma.installationNotification.create({
    data: {
      installationOrderId: notification.installationOrderId,
      customerRequestId: notification.customerRequestId,
      assignmentAttemptId: notification.assignmentAttemptId,
      smsType: notification.smsType,
      recipientType: notification.recipientType,
      recipientPhoneEncrypted: notification.recipientPhoneEncrypted,
      recipientPhoneHash: notification.recipientPhoneHash,
      smsTemplateKey: notification.smsTemplateKey,
      smsBody: notification.smsBody,
      provider: notification.provider,
      status: "PENDING",
      idempotencyKey: `manual-resend:${notification.id}:${now.toISOString()}`,
    },
    select: {
      id: true,
      status: true,
    },
  });
}

async function findRetryTargetNotification(notification: {
  id: string;
  installationOrderId: string | null;
  assignmentAttemptId: string | null;
  smsType: string;
  recipientType: string;
  recipientPhoneEncrypted: string | null;
  status: string;
  sentAt: Date | null;
}) {
  if (notification.assignmentAttemptId && notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST") {
    return (
      await prisma.installationNotification.findFirst({
        where: {
          assignmentAttemptId: notification.assignmentAttemptId,
          smsType: "INSTALLER_ASSIGNMENT_REQUEST",
          status: "FAILED",
          sentAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, sentAt: true },
      })
    ) ?? notification;
  }

  if (!notification.installationOrderId) {
    return notification;
  }

  return (
    await prisma.installationNotification.findFirst({
      where: {
        installationOrderId: notification.installationOrderId,
        assignmentAttemptId: null,
        smsType: notification.smsType,
        recipientType: notification.recipientType,
        recipientPhoneEncrypted: notification.recipientPhoneEncrypted,
        status: "FAILED",
        sentAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sentAt: true },
    })
  ) ?? notification;
}

export class SmsNotificationRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsNotificationRetryError";
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown SMS send failure";
}

async function skipStaleNotification(notification: InstallationNotificationForSend) {
  const staleReason = await getStaleNotificationReason(notification);
  if (!staleReason) return false;

  await prisma.installationNotification.update({
    where: { id: notification.id },
    data: {
      status: "FAILED",
      errorCode: "STALE_NOTIFICATION_SKIPPED",
      errorMessage: staleReason,
    },
  });

  return true;
}

async function getStaleNotificationReason(notification: InstallationNotificationForSend) {
  if (notification.smsType === "CUSTOMER_INPUT_LINK") {
    if (!notification.customerRequestId || !notification.installationOrderId) {
      return null;
    }

    const request = await prisma.installationCustomerRequest.findUnique({
      where: { id: notification.customerRequestId },
      select: {
        status: true,
        installationOrder: {
          select: {
            status: true,
            activeCustomerRequestId: true,
          },
        },
      },
    });

    if (
      !request ||
      request.status !== "PENDING_INPUT" ||
      request.installationOrder.status !== "WAITING_CUSTOMER_INPUT" ||
      request.installationOrder.activeCustomerRequestId !== notification.customerRequestId
    ) {
      return "CUSTOMER_INPUT_REQUEST_NOT_PENDING";
    }
  }

  if (notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST") {
    if (!notification.assignmentAttemptId || !notification.installationOrderId) {
      return "INSTALLER_ASSIGNMENT_NOT_FOUND";
    }

    const assignment = await prisma.installationInstallerAssignmentAttempt.findUnique({
      where: { id: notification.assignmentAttemptId },
      select: {
        id: true,
        status: true,
        installationOrder: {
          select: {
            status: true,
            activeAssignmentId: true,
          },
        },
      },
    });

    if (
      !assignment ||
      !["WAITING_INSTALLER_RESPONSE", "SYSTEM_SMS_RETRY_PENDING"].includes(assignment.status) ||
      assignment.installationOrder.status !== "WAITING_INSTALLER_RESPONSE" ||
      assignment.installationOrder.activeAssignmentId !== assignment.id
    ) {
      return "INSTALLER_ASSIGNMENT_NOT_WAITING_RESPONSE";
    }
  }

  return null;
}

async function sendOneInstallationNotification(
  notification: InstallationNotificationForSend,
  { now, sendSms }: { now: Date; sendSms: SendSms },
) {
  let providerAccepted = false;
  try {
    const sendResult = await sendSms(
      decryptNullablePii(notification.recipientPhoneEncrypted),
      notification.smsBody,
    );
    providerAccepted = true;
    await prisma.installationNotification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        provider: "solapi",
        providerMessageId: sendResult?.providerMessageId ?? null,
        providerStatus: null,
        providerStatusCode: null,
        providerReason: null,
        providerReportedAt: null,
        providerCheckedAt: null,
        deliveryCheckCount: 0,
        sentAt: now,
        errorCode: null,
        errorMessage: null,
      },
    });
    await runPostSendNotificationEffects(notification, now);
  } catch (error) {
    const retryCount = notification.retryCount + 1;
    const errorMessage = getErrorMessage(error);
    if (providerAccepted) {
      await handleUnknownSmsSendOutcome(notification, retryCount, errorMessage, now);
      throw error;
    }
    const shouldRetrySend = retryCount < MAX_SMS_SEND_ATTEMPTS;
    await prisma.installationNotification.update({
      where: { id: notification.id },
      data: {
        status: shouldRetrySend ? "PENDING" : "FAILED",
        retryCount,
        errorCode: "SMS_FAILED",
        errorMessage,
      },
    });
    if (
      notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
      notification.assignmentAttemptId
    ) {
      await handleAssignmentRequestSmsFailure(notification, {
        retryCount,
        errorMessage,
        now,
      });
    } else if (!shouldRetrySend && notification.installationOrderId) {
      await createSmsFailedIssue(notification, retryCount, errorMessage, now);
    }
    throw error;
  }
}

async function handleUnknownSmsSendOutcome(
  notification: InstallationNotificationForSend,
  retryCount: number,
  errorMessage: string,
  now: Date,
) {
  await prisma.installationNotification.update({
    where: { id: notification.id },
    data: {
      status: "UNKNOWN",
      retryCount,
      errorCode: "SMS_SEND_OUTCOME_UNKNOWN",
      errorMessage,
    },
  });

  if (
    notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
    notification.assignmentAttemptId
  ) {
    await handleAssignmentRequestSmsFailure(notification, {
      retryCount,
      errorMessage: `SMS_SEND_OUTCOME_UNKNOWN: ${errorMessage}`,
      maxAttempts: retryCount,
      now,
    });
  } else if (notification.installationOrderId) {
    await createSmsFailedIssue(
      notification,
      retryCount,
      `SMS_SEND_OUTCOME_UNKNOWN: ${errorMessage}`,
      now,
    );
  }
}

async function runPostSendNotificationEffects(
  notification: InstallationNotificationForSend,
  now: Date,
) {
  try {
    await resolveSmsFailedIssueForSentNotification(notification, now);
    if (
      notification.smsType === "INSTALLER_ASSIGNMENT_REQUEST" &&
      notification.assignmentAttemptId
    ) {
      const attempt = await prisma.installationInstallerAssignmentAttempt.update({
        where: { id: notification.assignmentAttemptId },
        data: {
          installerNotifiedAt: now,
          installerTokenExpiresAt: getInstallerResponseExpiresAt(now),
          status: "WAITING_INSTALLER_RESPONSE",
        },
        select: { installerId: true },
      });

      // Best-effort native FCM push (validated to wake Android from Doze). The
      // SMS just sent is the reliable fallback, so push failures only log and
      // must not create an automation issue.
      try {
        await sendAssignmentPushToInstaller(attempt.installerId, {
          title: "새 작업이 배정되었습니다",
          body: "앱에서 확인하고 수락/거절해 주세요.",
        });
      } catch (pushError) {
        console.error("[installation/notification/installer-push]", pushError);
      }
    }
  } catch (error) {
    console.error("[installation/notification/post-send]", error);
    if (notification.installationOrderId) {
      await createInstallationIssue({
        installationOrderId: notification.installationOrderId,
        type: "INSTALLATION_AUTOMATION_FAILED",
        title: "SMS 발송 후 상태 반영 실패",
        description: getErrorMessage(error),
        metadata: {
          stage: "POST_SEND_NOTIFICATION_EFFECTS",
          notificationId: notification.id,
          assignmentAttemptId: notification.assignmentAttemptId,
        },
        now,
      });
    }
  }
}

const INSTALLER_RESPONSE_TIMEOUT_HOURS = 24;
const MAX_SMS_SEND_ATTEMPTS = 2;
const MAX_SMS_DELIVERY_ATTEMPTS = 2;

function getInstallerResponseExpiresAt(now: Date) {
  return new Date(now.getTime() + INSTALLER_RESPONSE_TIMEOUT_HOURS * 60 * 60 * 1000);
}

async function handleAssignmentRequestSmsFailure(
  notification: InstallationNotificationForFailure,
  {
    retryCount,
    errorMessage,
    maxAttempts = MAX_SMS_SEND_ATTEMPTS,
    now,
  }: {
    retryCount: number;
    errorMessage: string;
    maxAttempts?: number;
    now: Date;
  },
) {
  if (!notification.assignmentAttemptId) return;

  if (retryCount < maxAttempts) {
    await prisma.installationInstallerAssignmentAttempt.update({
      where: { id: notification.assignmentAttemptId },
      data: {
        status: "SYSTEM_SMS_RETRY_PENDING",
      },
    });
    return;
  }

  await prisma.installationInstallerAssignmentAttempt.update({
    where: { id: notification.assignmentAttemptId },
    data: {
      status: "SYSTEM_SMS_FAILED",
    },
  });

  if (!notification.installationOrderId) return;

  const issue = await createSmsFailedIssue(notification, retryCount, errorMessage, now);
  await prisma.installationOrder.update({
    where: { id: notification.installationOrderId },
    data: {
      activeAssignmentId: null,
      currentInstallerId: null,
      hasOpenIssue: true,
      lastIssueId: issue.id,
      status: "READY_FOR_CANDIDATE_SELECTION",
      statusChangedAt: now,
    },
  });
  await prisma.installationOrderStatusEvent.create({
    data: {
      installationOrderId: notification.installationOrderId,
      fromStatus: null,
      toStatus: "READY_FOR_CANDIDATE_SELECTION",
      eventType: "INSTALLER_ASSIGNMENT_SMS_SEND_FAILED",
      actorType: "SYSTEM",
      actorId: null,
      reason: errorMessage,
      metadata: {
        assignmentAttemptId: notification.assignmentAttemptId,
        notificationId: notification.id,
        issueId: issue.id,
      },
      createdAt: now,
    },
  });
}

async function resolveSmsFailedIssueForSentNotification(
  notification: InstallationNotificationForSend,
  now: Date,
) {
  if (!notification.installationOrderId) return;
  const issueType = getSmsFailedIssueType(notification.smsType);

  const result = await prisma.installationIssue.updateMany({
    where: {
      installationOrderId: notification.installationOrderId,
      type: issueType,
      status: "OPEN",
      metadata: {
        path: ["notificationId"],
        equals: notification.id,
      },
    },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
      resolutionNote: "SMS 재전송 성공으로 자동 해결했습니다.",
      updatedAt: now,
    },
  });

  if (result.count === 0) return;

  const remainingOpenIssueCount = await prisma.installationIssue.count({
    where: {
      installationOrderId: notification.installationOrderId,
      status: "OPEN",
    },
  });

  if (remainingOpenIssueCount === 0) {
    await prisma.installationOrder.update({
      where: { id: notification.installationOrderId },
      data: { hasOpenIssue: false },
    });
  }
}

async function createSmsFailedIssue(
  notification: InstallationNotificationForFailure,
  retryCount: number,
  errorMessage: string,
  now: Date,
) {
  if (!notification.installationOrderId) {
    throw new Error("INSTALLATION_ORDER_ID_REQUIRED_FOR_SMS_ISSUE");
  }

  return createInstallationIssue({
    installationOrderId: notification.installationOrderId,
    type: getSmsFailedIssueType(notification.smsType),
    title: "SMS 발송 실패",
    description: errorMessage,
    metadata: {
      notificationId: notification.id,
      recipientPhoneEncrypted: notification.recipientPhoneEncrypted,
      retryCount,
      failureStage: "SEND",
    },
    now,
  });
}

async function createSmsDeliveryFailedIssue(
  notification: InstallationNotificationForDeliveryReport,
  retryCount: number,
  errorMessage: string,
  report: InstallationSmsDeliveryReport | null,
  now: Date,
) {
  if (!notification.installationOrderId) {
    throw new Error("INSTALLATION_ORDER_ID_REQUIRED_FOR_SMS_ISSUE");
  }

  const existingIssue = await prisma.installationIssue.findFirst({
    where: {
      installationOrderId: notification.installationOrderId,
      type: getSmsFailedIssueType(notification.smsType),
      status: "OPEN",
      metadata: {
        path: ["notificationId"],
        equals: notification.id,
      },
    },
    select: { id: true },
  });
  if (existingIssue) return existingIssue;

  return createInstallationIssue({
    installationOrderId: notification.installationOrderId,
    type: getSmsFailedIssueType(notification.smsType),
    title: "SMS 도달 실패",
    description: errorMessage,
    metadata: {
      notificationId: notification.id,
      recipientPhoneEncrypted: notification.recipientPhoneEncrypted,
      retryCount,
      failureStage: "DELIVERY",
      providerMessageId: notification.providerMessageId,
      providerStatus: report?.status ?? null,
      providerStatusCode: report?.statusCode ?? null,
      providerReason: report?.reason ?? null,
      providerReportedAt: report?.dateReported ?? null,
    },
    now,
  });
}

function getSmsFailedIssueType(smsType: string) {
  if (smsType === "INSTALLER_ASSIGNMENT_REQUEST" || smsType === "INSTALLER_HAPPYCALL_GUIDE") {
    return "INSTALLER_ASSIGNMENT_SMS_SEND_FAILED";
  }
  if (smsType === "CUSTOMER_ASSIGNMENT_CONFIRMED") {
    return "CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED";
  }
  return "CUSTOMER_INPUT_LINK_SMS_SEND_FAILED";
}

function isProviderDeliveryFailure(report: InstallationSmsDeliveryReport | null) {
  if (!report) return false;

  const status = report.status?.trim().toUpperCase() ?? "";
  if (status.includes("FAIL") || status.includes("ERROR")) return true;
  if (!report.statusCode || !report.dateReported) return false;

  // SOLAPI: 2000 is queued, 3000 is sending, and 4000 is delivered.
  // A polled delivery report must not turn either in-progress state into a failure.
  return !["2000", "3000", "4000"].includes(report.statusCode);
}

function isProviderDeliverySuccess(report: InstallationSmsDeliveryReport | null) {
  if (!report) return false;

  if (report.statusCode) {
    return report.statusCode === "4000" && Boolean(report.dateReported);
  }

  const status = report.status?.trim().toUpperCase() ?? "";
  return status.includes("COMPLETE") || status.includes("SUCCESS") || status.includes("DELIVER");
}

function formatDeliveryFailureMessage(report: InstallationSmsDeliveryReport | null) {
  const statusCode = report?.statusCode ?? "UNKNOWN_STATUS_CODE";
  const reason = report?.reason?.trim();
  if (reason) return `SMS_DELIVERY_FAILED: ${statusCode} ${reason}`;
  return `SMS_DELIVERY_FAILED: ${statusCode}`;
}

function parseProviderDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
