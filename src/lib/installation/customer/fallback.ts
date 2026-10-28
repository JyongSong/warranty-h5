import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FALLBACK_AFTER_HOURS,
  getCustomerFallbackDueAt,
} from "@/lib/installation/customer/timing";
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
  createdAt: Date;
  installationOrder: {
    source: {
      phoneEncrypted: string | null;
      addressEncrypted: string | null;
      dueDate: string | null;
    } | null;
  };
};

// 고객 입력 화면의 "상담 후 조율" 과 같은 값이다.
const UNSCHEDULED_INSTALL_TIME_SLOT = "상담 후 조율";

export type FallbackExpiredInstallationCustomerRequestsResult = {
  fallbackCount: number;
  manualRequiredCount: number;
  skippedCount: number;
};



export async function fallbackExpiredInstallationCustomerRequests({
  now = new Date(),
  limit = 25,
}: FallbackOptions = {}): Promise<FallbackExpiredInstallationCustomerRequestsResult> {
  // SQL 은 "최소 24시간 지난 것"까지만 좁힌다. 주말을 건너뛴 실제 만기는
  // getCustomerFallbackDueAt 이 정하므로 아래에서 한 번 더 거른다.
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
      createdAt: true,
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
    // 주말에 걸린 건은 다음 영업일까지 기다린다. 문안은 "24시간"만 안내하므로
    // 미루는 쪽으로만 어긋나게 한다.
    if (getCustomerFallbackDueAt(request.createdAt).getTime() > now.getTime()) {
      skippedCount += 1;
      continue;
    }

    const fallbackData = buildCustomerRequestFallbackData(request, now);
    if (!fallbackData.ok) {
      await moveCustomerRequestToManualRequired(request, fallbackData.missingReasons, now);
      manualRequiredCount += 1;
      skippedCount += 1;
      continue;
    }

    await applyCustomerRequestFallback(request, fallbackData.data, now);
    fallbackCount += 1;
  }

  return { fallbackCount, manualRequiredCount, skippedCount };
}

async function applyCustomerRequestFallback(
  request: FallbackCandidate,
  fallbackData: CustomerRequestFallbackData,
  now: Date,
) {
  await prisma.$transaction((tx) =>
    writeCustomerRequestFallback(tx, request, fallbackData, {
      now,
      actorType: "SYSTEM",
      reasonCode: `CUSTOMER_NO_INPUT_${FALLBACK_AFTER_HOURS}H_SOURCE_ORDER_USED`,
    }),
  );
}

// 관리자가 고객 입력을 기다리지 않고 기사를 바로 지정할 때, 아직 비어 있는 고객 요청을
// 주문 배송지·연락처로 채워 후보 선정 가능 상태로 넘긴다. 날짜 규칙은 자동 폴백과 같다.
export async function fillPendingCustomerRequestFromSourceOrder(
  tx: Prisma.TransactionClient,
  installationOrderId: string,
  { now, adminId }: { now: Date; adminId: string },
): Promise<{ ok: true } | { ok: false; missingReasons: string[] }> {
  const request = await tx.installationCustomerRequest.findFirst({
    where: { installationOrderId, status: "PENDING_INPUT", customerSubmittedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      installationOrderId: true,
      createdAt: true,
      installationOrder: {
        select: {
          source: {
            select: { phoneEncrypted: true, addressEncrypted: true, dueDate: true },
          },
        },
      },
    },
  });
  if (!request) return { ok: false, missingReasons: ["입력 대기 중인 고객 요청 없음"] };

  const fallbackData = buildCustomerRequestFallbackData(request, now);
  if (!fallbackData.ok) return fallbackData;

  await writeCustomerRequestFallback(tx, request, fallbackData.data, {
    now,
    actorType: "ADMIN",
    actorId: adminId,
    reasonCode: "ADMIN_MANUAL_ASSIGNMENT_SOURCE_ORDER_USED",
  });
  return { ok: true };
}

async function writeCustomerRequestFallback(
  tx: Prisma.TransactionClient,
  request: Pick<FallbackCandidate, "id" | "installationOrderId">,
  fallbackData: CustomerRequestFallbackData,
  {
    now,
    actorType,
    actorId = null,
    reasonCode,
  }: { now: Date; actorType: "SYSTEM" | "ADMIN"; actorId?: string | null; reasonCode: string },
) {
  // 납기일을 설치일로 쓸 수 없으면 날짜 없이 넘기고, 일정은 기사가 고객과 통화해 정한다.
  await tx.installationCustomerRequest.update({
    where: { id: request.id },
    data: {
      installAddressEncrypted: encryptNullablePii(fallbackData.installAddress),
      installAddress1Encrypted: encryptNullablePii(fallbackData.installAddress1),
      installAddress2Encrypted: encryptNullablePii(fallbackData.installAddress2),
      installDate: fallbackData.installDate,
      ...(fallbackData.installDate ? {} : { installTimeSlot: UNSCHEDULED_INSTALL_TIME_SLOT }),
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
        actorType,
        actorId,
        reason: fallbackData.installDateSkipReason
          ? `${reasonCode}_WITHOUT_DATE: ${fallbackData.installDateSkipReason}`
          : reasonCode,
        metadata: {
          customerRequestId: request.id,
          sourceInstallDate: fallbackData.installDate,
          ...(fallbackData.installDateSkipReason
            ? { installDateSkipReason: fallbackData.installDateSkipReason }
            : {}),
        },
      },
    },
    tx as never,
  );
}

async function moveCustomerRequestToManualRequired(
  request: FallbackCandidate,
  missingReasons: string[],
  now: Date,
) {
  const missingSummary = missingReasons.join(", ");
  await prisma.$transaction(async (tx) => {
    const issue = await createInstallationIssue(
      {
        installationOrderId: request.installationOrderId,
        type: "CUSTOMER_INPUT_NOT_SUBMITTED",
        title: "고객 정보 확인 필요",
        description:
          `고객 미입력 ${FALLBACK_AFTER_HOURS}시간 경과 후 주문 배송지와 연락처를 폴백할 수 없어 확인이 필요합니다. (${missingSummary})`,
        metadata: {
          customerRequestId: request.id,
          fallbackUsed: false,
          missingReasons,
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
          reason: `CUSTOMER_NO_INPUT_${FALLBACK_AFTER_HOURS}H_INSUFFICIENT_SOURCE_ORDER: ${missingSummary}`,
          metadata: {
            customerRequestId: request.id,
            issueId: issue.id,
            missingReasons,
          },
        },
      },
      tx as never,
    );
  });
}

type CustomerRequestFallbackData = {
  installAddress: string;
  installAddress1: string | null;
  installAddress2: string | null;
  customerPhone: string;
  installDate: string | null;
  installDateSkipReason: string | null;
};

function buildCustomerRequestFallbackData(
  request: Pick<FallbackCandidate, "installationOrder">,
  now: Date,
): { ok: true; data: CustomerRequestFallbackData } | { ok: false; missingReasons: string[] } {
  const source = request.installationOrder.source;
  const installAddress = decryptNullablePii(source?.addressEncrypted)?.trim();
  const customerPhone = source?.phoneEncrypted
    ? normalizePhone11(decryptNullablePii(source.phoneEncrypted) ?? "")
    : null;
  const parsedAddress = installAddress ? parseInstallationAddress(installAddress) : null;
  const splitAddress = installAddress ? splitInstallationSourceAddress(installAddress) : null;

  const missingReasons: string[] = [];
  if (!installAddress) missingReasons.push("배송지 주소 없음");
  else if (!parsedAddress) missingReasons.push("배송지 주소 해석 불가");
  if (!customerPhone) missingReasons.push("휴대전화번호 없음 또는 형식 오류");
  if (!installAddress || !customerPhone || missingReasons.length > 0) {
    return { ok: false, missingReasons };
  }

  const sourceDueDate = source?.dueDate ?? null;
  const sourceInstallDate = normalizeValidSourceInstallDate(sourceDueDate, now);

  return {
    ok: true,
    data: {
      installAddress,
      installAddress1: splitAddress?.address1 ?? null,
      installAddress2: splitAddress?.address2 ?? null,
      customerPhone,
      installDate: sourceInstallDate,
      installDateSkipReason: sourceInstallDate
        ? null
        : sourceDueDate?.trim()
          ? `납기일 ${sourceDueDate.trim()} 이 설치 가능 범위(D+2~D+30) 밖이라 일정은 기사·고객 협의`
          : "납기일 없음, 일정은 기사·고객 협의",
    },
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
