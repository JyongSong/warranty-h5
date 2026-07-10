import { prisma } from "@/lib/prisma";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";
import {
  parseInstallationAddress,
  splitInstallationSourceAddress,
} from "@/lib/installation/customer/address-parser";
import { createInstallationIssue } from "@/lib/installation/orders/issues/create";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";

type FallbackOptions = {
  now?: Date;
  limit?: number;
};

type FallbackCandidate = {
  id: string;
  installationOrderId: string;
  installationOrder: {
    source: {
      phoneEncrypted: string | null;
      addressEncrypted: string | null;
      dueDate: string | null;
    } | null;
  };
};

export type FallbackExpiredInstallationCustomerRequestsResult = {
  fallbackCount: number;
  manualRequiredCount: number;
  skippedCount: number;
};

const FALLBACK_AFTER_HOURS = 96;

export async function fallbackExpiredInstallationCustomerRequests({
  now = new Date(),
  limit = 25,
}: FallbackOptions = {}): Promise<FallbackExpiredInstallationCustomerRequestsResult> {
  const cutoff = new Date(now.getTime() - FALLBACK_AFTER_HOURS * 60 * 60 * 1000);
  const requests = await prisma.installationCustomerRequest.findMany({
    where: {
      status: "PENDING_INPUT",
      customerSubmittedAt: null,
      fallbackUsed: false,
      createdAt: {
        lte: cutoff,
      },
      installationOrder: {
        status: INSTALLATION_ORDER_STATUSES.WAITING_CUSTOMER_INPUT,
        issues: {
          none: {
            type: "CUSTOMER_INPUT_NOT_SUBMITTED",
            status: "OPEN",
          },
        },
        statusEvents: {
          none: {
            eventType: "CUSTOMER_FALLBACK_FAILED",
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      installationOrderId: true,
      installationOrder: {
        select: {
          source: {
            select: {
              phoneEncrypted: true,
              addressEncrypted: true,
              dueDate: true,
            },
          },
        },
      },
    },
  });

  let fallbackCount = 0;
  let manualRequiredCount = 0;
  let skippedCount = 0;

  for (const request of requests as FallbackCandidate[]) {
    const fallbackData = buildCustomerRequestFallbackData(request, now);
    if (!fallbackData) {
      await moveCustomerRequestToManualRequired(request, now);
      manualRequiredCount += 1;
      skippedCount += 1;
      continue;
    }

    await applyCustomerRequestFallback(request, fallbackData, now);
    fallbackCount += 1;
  }

  return { fallbackCount, manualRequiredCount, skippedCount };
}

async function applyCustomerRequestFallback(
  request: FallbackCandidate,
  fallbackData: {
    installAddress: string;
    installAddress1: string | null;
    installAddress2: string | null;
    customerPhone: string;
    installDate: string;
  },
  now: Date,
) {
  await prisma.$transaction(async (tx) => {
    await tx.installationCustomerRequest.update({
      where: { id: request.id },
      data: {
        installAddressEncrypted: encryptNullablePii(fallbackData.installAddress),
        installAddress1Encrypted: encryptNullablePii(fallbackData.installAddress1),
        installAddress2Encrypted: encryptNullablePii(fallbackData.installAddress2),
        installDate: fallbackData.installDate,
        customerPhoneEncrypted: encryptNullablePii(fallbackData.customerPhone),
        customerPhoneHash: hmacPii(fallbackData.customerPhone),
        customerPhoneSource: "ORDER",
        customerNote: null,
        customerSubmittedAt: now,
        fallbackUsed: true,
        status: "FALLBACK_USED",
      },
    });

    await transitionInstallationOrderStatus(
      request.installationOrderId,
      INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
      {
        now,
        event: {
          eventType: "CUSTOMER_FALLBACK_USED",
          actorType: "SYSTEM",
          reason: "CUSTOMER_NO_INPUT_96H_SOURCE_ORDER_USED",
          metadata: {
            customerRequestId: request.id,
            sourceInstallDate: fallbackData.installDate,
          },
        },
      },
      tx as never,
    );
  });
}

async function moveCustomerRequestToManualRequired(
  request: FallbackCandidate,
  now: Date,
) {
  await prisma.$transaction(async (tx) => {
    const issue = await createInstallationIssue(
      {
        installationOrderId: request.installationOrderId,
        type: "CUSTOMER_INPUT_NOT_SUBMITTED",
        title: "고객 정보 확인 필요",
        description:
          "고객 미입력 96시간 경과 후 주문 배송지와 연락처를 폴백할 수 없어 확인이 필요합니다.",
        metadata: {
          customerRequestId: request.id,
          fallbackUsed: false,
        },
        now,
      },
      tx as never,
    );

    await transitionInstallationOrderStatus(
      request.installationOrderId,
      INSTALLATION_ORDER_STATUSES.WAITING_CUSTOMER_INPUT,
      {
        now,
        orderData: {
          hasOpenIssue: true,
          lastIssueId: issue.id,
        },
        event: {
          eventType: "CUSTOMER_FALLBACK_FAILED",
          actorType: "SYSTEM",
          reason: "CUSTOMER_NO_INPUT_96H_INSUFFICIENT_SOURCE_ORDER",
          metadata: {
            customerRequestId: request.id,
            issueId: issue.id,
          },
        },
      },
      tx as never,
    );
  });
}

function buildCustomerRequestFallbackData(request: FallbackCandidate, now: Date) {
  const installAddress = decryptNullablePii(request.installationOrder.source?.addressEncrypted)?.trim();
  const customerPhone = request.installationOrder.source?.phoneEncrypted
    ? normalizePhone11(decryptNullablePii(request.installationOrder.source.phoneEncrypted) ?? "")
    : null;
  const sourceInstallDate = normalizeValidSourceInstallDate(
    request.installationOrder.source?.dueDate ?? null,
    now,
  );
  const parsedAddress = installAddress ? parseInstallationAddress(installAddress) : null;
  const splitAddress = installAddress ? splitInstallationSourceAddress(installAddress) : null;

  if (!installAddress || !parsedAddress || !customerPhone || !sourceInstallDate) {
    return null;
  }

  return {
    installAddress,
    installAddress1: splitAddress?.address1 ?? null,
    installAddress2: splitAddress?.address2 ?? null,
    customerPhone,
    installDate: sourceInstallDate,
  };
}

function normalizeValidSourceInstallDate(value: string | null, now: Date) {
  const trimmed = normalizeSourceInstallDate(value);
  if (!trimmed) {
    return null;
  }

  const targetDay = parseYmdToUtcDay(trimmed);
  const todayDay = parseYmdToUtcDay(getKstYmd(now));
  if (targetDay === null || todayDay === null) {
    return null;
  }
  if (targetDay < todayDay + 2 || targetDay > todayDay + 30) {
    return null;
  }

  return trimmed;
}

function normalizeSourceInstallDate(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  return null;
}

function getKstYmd(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function parseYmdToUtcDay(value: string) {
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

  return Math.floor(date.getTime() / 86_400_000);
}
