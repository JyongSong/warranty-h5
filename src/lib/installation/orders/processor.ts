import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizeNameForHash,
  normalizePhone11,
} from "@/lib/piiCrypto";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import { buildCustomerReservationLinkSmsContent } from "@/lib/installation/notifications/sms-content";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { formatSourceItemsProductSummary } from "@/lib/installation/orders/source/source-items";

type PendingInstallationOrder = {
  id: string;
  status?: string;
  activeCustomerRequestId?: string | null;
  source: {
    sourceKey: string;
    customerNameEncrypted: string | null;
    phoneEncrypted: string | null;
    memo: string | null;
  } | null;
};

type ProcessPendingInstallationOrdersOptions = {
  limit?: number;
  baseUrl: string;
  now?: Date;
  tokenFactory?: () => string;
};

export type ProcessPendingInstallationOrdersResult = {
  processedCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
};

export type CreateCustomerInputRequestsForInstallationOrdersResult = ProcessPendingInstallationOrdersResult & {
  skippedAlreadyRequestedCount: number;
  skippedInvalidStateCount: number;
};

const CUSTOMER_REQUEST_TOKEN_TTL_HOURS = 72;

export async function processPendingInstallationOrders({
  limit = 25,
  baseUrl,
  now = new Date(),
  tokenFactory = createCustomerRequestToken,
}: ProcessPendingInstallationOrdersOptions): Promise<ProcessPendingInstallationOrdersResult> {
  const orders = await prisma.installationOrder.findMany({
    select: {
      id: true,
      source: {
        select: {
          sourceKey: true,
          customerNameEncrypted: true,
          phoneEncrypted: true,
          memo: true,
        },
      },
    },
    where: {
      status: INSTALLATION_ORDER_STATUSES.CUSTOMER_INPUT_SMS_REQUIRED,
      activeCustomerRequestId: null,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const result: ProcessPendingInstallationOrdersResult = {
    processedCount: 0,
    skippedDuplicateCount: 0,
    failedCount: 0,
  };

  for (const order of orders) {
    try {
      await processPendingInstallationOrder(order, {
        baseUrl,
        now,
        tokenFactory,
      });
      result.processedCount += 1;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        result.skippedDuplicateCount += 1;
        continue;
      }
      if (isPhoneValidationError(error)) {
        await createSourcePhoneInvalidIssue(order, now);
      }

      console.error("[installation/order/processor]", {
        orderId: order.id,
        sourceKey: order.source?.sourceKey ?? null,
        error,
      });
      result.failedCount += 1;
    }
  }

  return result;
}

export async function createCustomerInputRequestsForInstallationOrders({
  orderIds,
  baseUrl,
  now = new Date(),
  tokenFactory = createCustomerRequestToken,
}: ProcessPendingInstallationOrdersOptions & {
  orderIds: string[];
}): Promise<CreateCustomerInputRequestsForInstallationOrdersResult> {
  const normalizedOrderIds = Array.from(
    new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean)),
  );
  const result: CreateCustomerInputRequestsForInstallationOrdersResult = {
    processedCount: 0,
    skippedAlreadyRequestedCount: 0,
    skippedDuplicateCount: 0,
    skippedInvalidStateCount: 0,
    failedCount: 0,
  };

  if (normalizedOrderIds.length === 0) return result;

  const orders = await prisma.installationOrder.findMany({
    select: {
      id: true,
      status: true,
      activeCustomerRequestId: true,
      source: {
        select: {
          sourceKey: true,
          customerNameEncrypted: true,
          phoneEncrypted: true,
          memo: true,
        },
      },
    },
    where: {
      id: { in: normalizedOrderIds },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const order of orders) {
    if (order.status !== INSTALLATION_ORDER_STATUSES.CUSTOMER_INPUT_SMS_REQUIRED) {
      result.skippedInvalidStateCount += 1;
      continue;
    }
    if (order.activeCustomerRequestId) {
      result.skippedAlreadyRequestedCount += 1;
      continue;
    }

    try {
      await processPendingInstallationOrder(order, {
        baseUrl,
        now,
        tokenFactory,
      });
      result.processedCount += 1;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        result.skippedDuplicateCount += 1;
        continue;
      }
      if (isPhoneValidationError(error)) {
        await createSourcePhoneInvalidIssue(order, now);
      }

      console.error("[installation/order/manual-customer-input-sms]", {
        orderId: order.id,
        sourceKey: order.source?.sourceKey ?? null,
        error,
      });
      result.failedCount += 1;
    }
  }

  return result;
}

async function processPendingInstallationOrder(
  order: PendingInstallationOrder,
  options: Required<Pick<ProcessPendingInstallationOrdersOptions, "baseUrl" | "now" | "tokenFactory">>,
) {
  await prisma.$transaction(async (tx) => {
    const token = options.tokenFactory();
    const tokenHash = hashInstallationCustomerToken(token);
    const expiresAt = new Date(
      options.now.getTime() + CUSTOMER_REQUEST_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );
    const customerName = decryptNullablePii(order.source?.customerNameEncrypted)?.trim() || null;
    const customerPhone = order.source?.phoneEncrypted
      ? normalizePhone11(decryptNullablePii(order.source.phoneEncrypted) ?? "")
      : null;
    const request = await tx.installationCustomerRequest.create({
      data: {
        installationOrderId: order.id,
        requestNumber: 1,
        customerNameEncrypted: encryptNullablePii(customerName),
        customerNameHash: customerName ? hmacPii(normalizeNameForHash(customerName)) : null,
        customerPhoneEncrypted: null,
        customerPhoneHash: null,
        customerPhoneSource: "PENDING_CUSTOMER",
        installAddressEncrypted: null,
        customerTokenHash: tokenHash,
        customerTokenExpiresAt: expiresAt,
        status: "PENDING_INPUT",
      },
    });

    const reservationUrl = `${stripTrailingSlash(options.baseUrl)}/i/c/${encodeURIComponent(token)}`;
    const smsContent = buildCustomerReservationLinkSmsContent({
      productSummary: formatSourceItemsProductSummary(null, order.source?.memo),
      reservationUrl,
    });

    await tx.installationNotification.create({
      data: {
        installationOrderId: order.id,
        customerRequestId: request.id,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientType: "CUSTOMER",
        recipientPhoneEncrypted: encryptNullablePii(customerPhone),
        recipientPhoneHash: customerPhone ? hmacPii(customerPhone) : null,
        smsTemplateKey: smsContent.templateKey,
        smsBody: smsContent.text,
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: `customer-reservation-link:${order.id}:1`,
      },
    });

    await transitionInstallationOrderStatus(
      order.id,
      INSTALLATION_ORDER_STATUSES.WAITING_CUSTOMER_INPUT,
      {
        now: options.now,
        orderData: {
          activeCustomerRequestId: request.id,
        },
        event: {
          eventType: "CUSTOMER_INPUT_SMS_QUEUED",
          actorType: "SYSTEM",
          metadata: {
            customerRequestId: request.id,
          },
        },
      },
      tx as never,
    );
  });
}

function createCustomerRequestToken() {
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

function isPhoneValidationError(error: unknown) {
  return error instanceof Error && error.message === "PHONE_11_DIGITS_REQUIRED";
}

async function createSourcePhoneInvalidIssue(order: PendingInstallationOrder, now: Date) {
  await createInstallationIssue({
    installationOrderId: order.id,
    type: "ORDER_CUSTOMER_PHONE_INVALID",
    title: "고객 전화번호 형식 오류",
    description: "원천 주문 고객 전화번호가 모바일 번호 형식이 아니어서 고객 입력 안내 문자를 발송할 수 없습니다.",
    metadata: {
      sourceKey: order.source?.sourceKey ?? null,
      errorCode: "PHONE_11_DIGITS_REQUIRED",
    },
    now,
  });
}
