import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  REMINDER_AFTER_HOURS,
  REMINDER_TOKEN_TTL_HOURS,
} from "@/lib/installation/customer/timing";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import {
  buildCustomerReservationReminderSmsContent,
  toInstallationNotificationAlimtalkFields,
} from "@/lib/installation/notifications/sms-content";
import { INSTALLATION_ORDER_STATUSES } from "@/lib/installation/orders/status";
import { formatSourceItemsProductSummary } from "@/lib/installation/orders/source/source-items";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";

type ReminderOptions = {
  baseUrl: string;
  now?: Date;
  limit?: number;
  tokenFactory?: () => string;
};

type ReminderCandidate = {
  id: string;
  installationOrderId: string;
  customerPhoneEncrypted: string | null;
  installationOrder: {
    source: {
      phoneEncrypted: string | null;
      memo: string | null;
    } | null;
  };
};

export type RemindExpiredInstallationCustomerRequestsResult = {
  remindedCount: number;
  skippedCount: number;
  failedCount: number;
};



export async function remindExpiredInstallationCustomerRequests({
  baseUrl,
  now = new Date(),
  limit = 25,
  tokenFactory = createCustomerReminderToken,
}: ReminderOptions): Promise<RemindExpiredInstallationCustomerRequestsResult> {
  const reminderCutoff = new Date(now.getTime() - REMINDER_AFTER_HOURS * 60 * 60 * 1000);
  const requests = await prisma.installationCustomerRequest.findMany({
    where: {
      status: "PENDING_INPUT",
      customerSubmittedAt: null,
      fallbackUsed: false,
      createdAt: {
        lte: reminderCutoff,
      },
      installationOrder: {
        status: INSTALLATION_ORDER_STATUSES.WAITING_CUSTOMER_INPUT,
        hasOpenIssue: false,
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      installationOrderId: true,
      customerPhoneEncrypted: true,
      installationOrder: {
        select: {
          source: {
            select: {
              phoneEncrypted: true,
              memo: true,
            },
          },
        },
      },
    },
  });

  let remindedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const request of requests as ReminderCandidate[]) {
    const recipientPhone =
      decryptNullablePii(request.customerPhoneEncrypted) ??
      decryptNullablePii(request.installationOrder.source?.phoneEncrypted);
    if (!recipientPhone?.trim()) {
      await createInstallationIssue({
        installationOrderId: request.installationOrderId,
        type: "ORDER_CUSTOMER_PHONE_MISSING",
        title: "고객 리마인드 연락처 없음",
        description: "고객 입력 리마인드 문자를 발송할 전화번호가 없어 관리자 확인이 필요합니다.",
        metadata: {
          customerRequestId: request.id,
          stage: "CUSTOMER_INPUT_REMINDER",
        },
        now,
      });
      skippedCount += 1;
      continue;
    }

    try {
      await createReminder(request, normalizePhone11(recipientPhone), { baseUrl, now, tokenFactory });
      remindedCount += 1;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        skippedCount += 1;
        continue;
      }
      await createInstallationIssue({
        installationOrderId: request.installationOrderId,
        type: "INSTALLATION_AUTOMATION_FAILED",
        title: "고객 리마인드 생성 실패",
        description: error instanceof Error ? error.message : "UNKNOWN_CUSTOMER_REMINDER_ERROR",
        metadata: {
          customerRequestId: request.id,
          stage: "CUSTOMER_INPUT_REMINDER",
        },
        now,
      });
      skippedCount += 1;
      failedCount += 1;
    }
  }

  return { remindedCount, skippedCount, failedCount };
}

async function createReminder(
  request: ReminderCandidate,
  recipientPhone: string,
  options: Required<Pick<ReminderOptions, "baseUrl" | "now" | "tokenFactory">>,
) {
  await prisma.$transaction(async (tx) => {
    const token = options.tokenFactory();
    const reservationUrl = `${stripTrailingSlash(options.baseUrl)}/i/c/${encodeURIComponent(token)}`;
    const smsContent = buildCustomerReservationReminderSmsContent({
      productSummary: formatSourceItemsProductSummary(
        null,
        request.installationOrder.source?.memo,
      ),
      reservationUrl,
    });

    await tx.installationCustomerRequest.update({
      where: { id: request.id },
      data: {
        customerTokenHash: hashInstallationCustomerToken(token),
        customerTokenExpiresAt: new Date(
          options.now.getTime() + REMINDER_TOKEN_TTL_HOURS * 60 * 60 * 1000,
        ),
      },
    });

    await tx.installationNotification.create({
      data: {
        installationOrderId: request.installationOrderId,
        customerRequestId: request.id,
        smsType: "CUSTOMER_INPUT_REMINDER",
        recipientType: "CUSTOMER",
        recipientPhoneEncrypted: encryptNullablePii(recipientPhone),
        recipientPhoneHash: hmacPii(recipientPhone),
        smsTemplateKey: smsContent.templateKey,
        ...toInstallationNotificationAlimtalkFields(smsContent),
        smsBody: smsContent.text,
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: `customer-reservation-reminder:${request.id}:1`,
      },
    });
  });
}

function createCustomerReminderToken() {
  return randomBytes(16).toString("base64url");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
