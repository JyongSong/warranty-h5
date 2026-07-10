import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import { buildCustomerReservationReminderSmsContent } from "@/lib/installation/notifications/sms-content";
import { INSTALLATION_ORDER_STATUSES } from "@/lib/installation/orders/status";
import { formatSourceItemsProductSummary } from "@/lib/installation/orders/source/source-items";

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
};

const REMINDER_TOKEN_TTL_HOURS = 24;
const REMINDER_AFTER_HOURS = 72;

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

  for (const request of requests as ReminderCandidate[]) {
    const recipientPhone =
      decryptNullablePii(request.customerPhoneEncrypted) ??
      decryptNullablePii(request.installationOrder.source?.phoneEncrypted);
    if (!recipientPhone?.trim()) {
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
      throw error;
    }
  }

  return { remindedCount, skippedCount };
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
