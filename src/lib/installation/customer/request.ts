import { prisma } from "@/lib/prisma";
import {
  INSTALL_DATE_MAX_DAYS_AHEAD,
  INSTALL_DATE_MIN_DAYS_AHEAD,
} from "@/lib/installation/customer/timing";
import {
  decryptNullablePii,
  encryptNullablePii,
  hmacPii,
  normalizePhone11,
} from "@/lib/piiCrypto";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import {
  parseInstallationAddress,
  splitInstallationSourceAddress,
} from "@/lib/installation/customer/address-parser";
import { dispatchReadyInstallationOrders } from "@/lib/installation/installer/dispatch";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";

export type InstallationCustomerRequestTokenStatus =
  | "VALID"
  | "NOT_FOUND"
  | "EXPIRED"
  | "SUBMITTED"
  | "CANCELLED";

type LookupOptions = {
  now?: Date;
};

type SubmitInput = {
  installAddress: string;
  installAddressDetail?: string | null;
  installDate: string;
  installTimeSlot?: string | null;
  customerPhone: string;
  customerNote?: string | null;
  now?: Date;
};

export async function getInstallationCustomerRequestByToken(
  token: string,
  { now = new Date() }: LookupOptions = {},
) {
  const request = await prisma.installationCustomerRequest.findUnique({
    where: { customerTokenHash: hashInstallationCustomerToken(token.trim()) },
    select: {
      id: true,
      installationOrderId: true,
      requestNumber: true,
      customerNameEncrypted: true,
      customerPhoneEncrypted: true,
      installAddressEncrypted: true,
      installDate: true,
      installTimeSlot: true,
      customerNote: true,
      customerTokenExpiresAt: true,
      customerSubmittedAt: true,
      status: true,
      installationOrder: {
        select: {
          id: true,
          source: {
            select: {
              sourceKey: true,
              memo: true,
              customerNameEncrypted: true,
              phoneEncrypted: true,
              addressEncrypted: true,
            },
          },
          status: true,
        },
      },
    },
  });

  if (!request) {
    return { status: "NOT_FOUND" as const, request: null };
  }

  return {
    status: getCustomerRequestTokenStatus(request, now),
    request: decryptCustomerRequest(request),
  };
}

export async function submitInstallationCustomerRequest(token: string, input: SubmitInput) {
  const now = input.now ?? new Date();
  const normalized = normalizeCustomerRequestSubmitInput(input, now);

  const submitted = await prisma.$transaction(async (tx) => {
    const request = await tx.installationCustomerRequest.findUnique({
      where: { customerTokenHash: hashInstallationCustomerToken(token.trim()) },
      select: {
        id: true,
        installationOrderId: true,
        customerTokenExpiresAt: true,
        customerSubmittedAt: true,
        status: true,
        installationOrder: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new InstallationCustomerRequestError("TOKEN_NOT_FOUND");
    }

    const status = getCustomerRequestTokenStatus(request, now);
    if (status === "EXPIRED") {
      throw new InstallationCustomerRequestError("TOKEN_EXPIRED");
    }
    if (status === "SUBMITTED") {
      throw new InstallationCustomerRequestError("ALREADY_SUBMITTED");
    }
    if (status === "CANCELLED") {
      throw new InstallationCustomerRequestError("REQUEST_CANCELLED");
    }

    const updatedRequest = await tx.installationCustomerRequest.update({
      where: { id: request.id },
      data: {
        installAddressEncrypted: encryptNullablePii(normalized.installAddress),
        installAddressDetailEncrypted: encryptNullablePii(normalized.installAddressDetail),
        installAddress1Encrypted: encryptNullablePii(normalized.installAddress1),
        installAddress2Encrypted: encryptNullablePii(normalized.installAddress2),
        installDate: normalized.installDate,
        installTimeSlot: normalized.installTimeSlot,
        customerPhoneEncrypted: encryptNullablePii(normalized.customerPhone),
        customerPhoneHash: hmacPii(normalized.customerPhone),
        customerPhoneSource: "CUSTOMER",
        customerNote: normalized.customerNote,
        customerSubmittedAt: now,
        status: "SUBMITTED",
      },
    });

    await transitionInstallationOrderStatus(
      request.installationOrderId,
      INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
      {
        now,
        event: {
          eventType: "CUSTOMER_SUBMITTED",
          actorType: "CUSTOMER",
          metadata: {
            customerRequestId: request.id,
          },
        },
      },
      tx as never,
    );

    return {
      request: updatedRequest,
      installationOrderId: request.installationOrderId,
    };
  });

  if (isInstallDateWithinDispatchWindow(normalized.installDate, now)) {
    await dispatchReadyInstallationOrders({
      now,
      limit: 1,
      orderId: submitted.installationOrderId,
    });
  }

  return {
    ...submitted.request,
    installationOrderId: submitted.installationOrderId,
  };
}

export class InstallationCustomerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationCustomerRequestError";
  }
}

type EncryptedCustomerRequest = {
  customerNameEncrypted: string | null;
  customerPhoneEncrypted: string | null;
  installAddressEncrypted: string | null;
  installationOrder: {
    source: {
      sourceKey: string;
      memo: string | null;
      customerNameEncrypted: string | null;
      phoneEncrypted: string | null;
      addressEncrypted: string | null;
    } | null;
  };
};

type DecryptedCustomerRequest<T extends EncryptedCustomerRequest> = Omit<
  T,
  "customerNameEncrypted" | "customerPhoneEncrypted" | "installAddressEncrypted" | "installationOrder"
> & {
  customerName: string | null;
  customerPhone: string | null;
  installAddress: string | null;
  installationOrder: Omit<
    T["installationOrder"],
    "source"
  > & {
    sourceErpOrderNo: string;
    sourceMemo: string | null;
    sourceCustomerName: string | null;
    sourcePhone: string | null;
    sourceAddress: string | null;
  };
};

function decryptCustomerRequest<T extends EncryptedCustomerRequest>(
  request: T,
): DecryptedCustomerRequest<T> {
  const {
    customerNameEncrypted,
    customerPhoneEncrypted,
    installAddressEncrypted,
    installationOrder,
    ...requestFields
  } = request;
  const {
    source,
    ...installationOrderFields
  } = installationOrder;

  return {
    ...requestFields,
    customerName: decryptNullablePii(customerNameEncrypted),
    customerPhone: decryptNullablePii(customerPhoneEncrypted),
    installAddress: decryptNullablePii(installAddressEncrypted),
    installationOrder: {
      ...installationOrderFields,
      sourceErpOrderNo: source?.sourceKey ?? "",
      sourceMemo: source?.memo ?? null,
      sourceCustomerName: decryptNullablePii(source?.customerNameEncrypted),
      sourcePhone: decryptNullablePii(source?.phoneEncrypted),
      sourceAddress: decryptNullablePii(source?.addressEncrypted),
    },
  } as DecryptedCustomerRequest<T>;
}

function getCustomerRequestTokenStatus(
  request: {
    status: string;
    customerTokenExpiresAt: Date;
    customerSubmittedAt: Date | null;
    installationOrder?: { status: string } | null;
  },
  now: Date,
): InstallationCustomerRequestTokenStatus {
  if (request.installationOrder?.status === INSTALLATION_ORDER_STATUSES.CANCELLED) {
    return "CANCELLED";
  }
  if (request.status === "CANCELLED") {
    return "CANCELLED";
  }
  if (request.customerSubmittedAt || request.status === "SUBMITTED") {
    return "SUBMITTED";
  }
  if (request.customerTokenExpiresAt.getTime() < now.getTime()) {
    return "EXPIRED";
  }
  return "VALID";
}

function normalizeCustomerRequestSubmitInput(input: SubmitInput, now: Date) {
  const installAddress = input.installAddress.trim();
  const installAddressDetail = input.installAddressDetail?.trim() || null;
  const installDate = input.installDate.trim();
  const installTimeSlot = input.installTimeSlot?.trim() || null;
  const customerPhone = normalizePhone11(input.customerPhone);
  const customerNote = input.customerNote?.trim() || null;

  if (!installAddress) {
    throw new InstallationCustomerRequestError("INSTALL_ADDRESS_REQUIRED");
  }
  const parsedAddress = parseInstallationAddress(installAddress);
  if (!parsedAddress) {
    throw new InstallationCustomerRequestError("INSTALL_ADDRESS_UNPARSEABLE");
  }
  const splitAddress = splitInstallationSourceAddress(installAddress);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate)) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_INVALID");
  }
  validateInstallDateRange(installDate, now);
  if (!customerPhone) {
    throw new InstallationCustomerRequestError("CUSTOMER_PHONE_REQUIRED");
  }

  return {
    installAddress,
    installAddressDetail,
    installAddress1: splitAddress?.address1 ?? null,
    installAddress2: splitAddress?.address2 ?? null,
    installDate,
    installTimeSlot,
    customerPhone,
    customerNote,
  };
}

function validateInstallDateRange(installDate: string, now: Date) {
  const targetDay = parseYmdToUtcDay(installDate);
  if (targetDay === null) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_INVALID");
  }

  const todayKst = getKstYmd(now);
  const minDay = addDaysToUtcDay(parseYmdToUtcDay(todayKst) as number, INSTALL_DATE_MIN_DAYS_AHEAD);
  const maxDay = addDaysToUtcDay(parseYmdToUtcDay(todayKst) as number, INSTALL_DATE_MAX_DAYS_AHEAD);

  if (targetDay < minDay || targetDay > maxDay) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_OUT_OF_RANGE");
  }
}

function isInstallDateWithinDispatchWindow(installDate: string, now: Date) {
  const targetDay = parseYmdToUtcDay(installDate);
  if (targetDay === null) return false;

  const todayKst = getKstYmd(now);
  const todayDay = parseYmdToUtcDay(todayKst);
  if (todayDay === null) return false;

  return targetDay <= addDaysToUtcDay(todayDay, 10);
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
    throw new InstallationCustomerRequestError("INSTALL_DATE_INVALID");
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

function addDaysToUtcDay(day: number, days: number) {
  return day + days;
}
