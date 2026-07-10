import { prisma } from "@/lib/prisma";
import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import {
  encryptNullablePii,
  hmacPii,
  normalizeNameForHash,
  normalizePhone11,
} from "@/lib/piiCrypto";

export type SaveFetchedInstallationOrdersResult = {
  count: number;
};

type InstallationOrderSourceCreateManyInput = {
  sourceKey: string;
  customerNameEncrypted: string | null;
  customerNameHash: string | null;
  phoneEncrypted: string | null;
  phoneHash: string | null;
  addressEncrypted: string | null;
  dueDate: string | null;
  orderNumbers: string | null;
  noGirl: string | null;
  memo: string | null;
};

type PrismaWithInstallationOrderSource = typeof prisma & {
  installationOrderSource: {
    createMany(args: {
      data: InstallationOrderSourceCreateManyInput[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: { sourceKey: { in: string[] } };
      select: { id: true; sourceKey: true };
    }): Promise<Array<{ id: string; sourceKey: string }>>;
  };
  installationOrder: {
    createMany(args: {
      data: Array<{ sourceId: string }>;
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
  };
};

export function annotateFetchedInstallationOrderValidation(
  order: FetchedInstallationOrder,
): FetchedInstallationOrder {
  const sourceErrorCode = getFetchedInstallationOrderSourceErrorCode(order);

  if (!sourceErrorCode) {
    return {
      ...order,
      source_error_code: null,
    };
  }

  return {
    ...order,
    memo: appendErrorCodeToMemo(order.memo, sourceErrorCode),
    source_error_code: sourceErrorCode,
  };
}

function toInstallationOrderSourceCreateInput(order: FetchedInstallationOrder): InstallationOrderSourceCreateManyInput {
  const sourceKey = order.source_key?.trim();
  if (!sourceKey) {
    throw new Error("source_key is required");
  }

  const customerName = order.customer_name?.trim() || null;
  const phone = order.phone?.trim() || null;
  const address = order.address?.trim() || null;

  return {
    sourceKey,
    customerNameEncrypted: encryptNullablePii(customerName),
    customerNameHash: customerName ? hmacPii(normalizeNameForHash(customerName)) : null,
    phoneEncrypted: encryptNullablePii(phone),
    phoneHash: normalizeSourcePhoneForHash(phone),
    addressEncrypted: encryptNullablePii(address),
    dueDate: order.due_date,
    orderNumbers: order.order_numbers,
    noGirl: order.no_girl,
    memo: order.memo,
  };
}

function getFetchedInstallationOrderSourceErrorCode(order: FetchedInstallationOrder) {
  if (!order.phone?.trim()) return null;

  try {
    normalizePhone11(order.phone);
    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_11_DIGITS_REQUIRED") {
      return "PHONE_11_DIGITS_REQUIRED";
    }

    throw error;
  }
}

function appendErrorCodeToMemo(memo: string | null | undefined, errorCode: string) {
  const normalizedMemo = memo?.trim();
  if (!normalizedMemo) return errorCode;
  if (normalizedMemo.includes(errorCode)) return normalizedMemo;
  return `${normalizedMemo} / ${errorCode}`;
}

function normalizeSourcePhoneForHash(value: string | null | undefined) {
  const rawPhone = value?.trim() || null;
  if (!rawPhone) return null;

  try {
    return hmacPii(normalizePhone11(rawPhone));
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_11_DIGITS_REQUIRED") {
      return null;
    }

    throw error;
  }
}

export async function saveFetchedInstallationOrderSources(
  orders: FetchedInstallationOrder[],
): Promise<SaveFetchedInstallationOrdersResult> {
  const prismaWithOrderSource = prisma as PrismaWithInstallationOrderSource;
  const sourceKeys = orders.map((order) => order.source_key.trim());
  const result = await prismaWithOrderSource.installationOrderSource.createMany({
    data: orders.map(toInstallationOrderSourceCreateInput),
    skipDuplicates: true,
  });
  const sources = await prismaWithOrderSource.installationOrderSource.findMany({
    where: { sourceKey: { in: sourceKeys } },
    select: { id: true, sourceKey: true },
  });

  if (sources.length > 0) {
    await prismaWithOrderSource.installationOrder.createMany({
      data: sources.map((source) => ({ sourceId: source.id })),
      skipDuplicates: true,
    });
  }

  return { count: result.count };
}

export async function saveFetchedInstallationOrders(
  orders: FetchedInstallationOrder[],
): Promise<SaveFetchedInstallationOrdersResult> {
  return saveFetchedInstallationOrderSources(orders);
}
