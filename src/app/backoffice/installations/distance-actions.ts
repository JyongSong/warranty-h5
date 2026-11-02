"use server";

import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { inferDispatchRequirementFromMemo } from "@/lib/installation/orders/source/source-items";
import { listDispatchCandidateInstallers } from "@/lib/installation/installer/source";
import {
  getInstallerDistances,
  pickNearestInstallers,
  type InstallerDistance,
} from "@/lib/installation/distance/service";

const CLOSER_INSTALLER_LIMIT = 2;

export type AssignmentDistanceResult =
  | {
      ok: true;
      status: "OK" | "ADDRESS_NOT_FOUND" | "NO_CUSTOMER_ADDRESS";
      candidate: InstallerDistance | null;
      closer: InstallerDistance[];
    }
  | { ok: false; error: string };

export type OrderInstallerDistancesResult =
  | { ok: true; status: "OK" | "ADDRESS_NOT_FOUND" | "NO_CUSTOMER_ADDRESS"; distances: InstallerDistance[] }
  | { ok: false; error: string };

async function loadOrderDistanceContext(orderId: string) {
  const order = await prisma.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      activeCustomerRequestId: true,
      source: { select: { addressEncrypted: true, memo: true } },
      customerRequests: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, installAddressEncrypted: true },
      },
    },
  });
  if (!order) return null;

  const request =
    order.customerRequests.find((item) => item.id === order.activeCustomerRequestId) ??
    order.customerRequests[0] ??
    null;
  const { requiredCapabilities, requiredAqaraAppCapability } = inferDispatchRequirementFromMemo(order.source?.memo);
  const eligibleInstallers = await listDispatchCandidateInstallers({
    requiredCapabilities,
    requiredAqaraAppCapability,
  });

  return {
    address:
      decryptNullablePii(request?.installAddressEncrypted) ?? decryptNullablePii(order.source?.addressEncrypted),
    eligibleInstallerIds: eligibleInstallers.map((installer) => installer.businessNumber),
  };
}

export async function getAssignmentDistanceAction(
  orderId: string,
  installerId: string,
): Promise<AssignmentDistanceResult> {
  const { errorResponse } = await requireAdminApi(0);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  try {
    const context = await loadOrderDistanceContext(orderId);
    if (!context?.address) return { ok: true, status: "NO_CUSTOMER_ADDRESS", candidate: null, closer: [] };

    const result = await getInstallerDistances({
      address: context.address,
      eligibleInstallerIds: context.eligibleInstallerIds,
      includeInstallerIds: [installerId],
    });
    if (result.status !== "OK") return { ok: true, status: result.status, candidate: null, closer: [] };

    const candidate = result.included[0] ?? null;
    const closer = pickNearestInstallers(
      result.eligible.filter((distance) => distance.installerId !== installerId),
      CLOSER_INSTALLER_LIMIT,
    ).filter(
      (distance) =>
        candidate?.drivingMeters === null ||
        candidate?.drivingMeters === undefined ||
        (distance.drivingMeters as number) < candidate.drivingMeters,
    );

    return { ok: true, status: "OK", candidate, closer };
  } catch (error) {
    console.error("[installation/distance/assignment]", getErrorMessage(error, "DISTANCE_LOOKUP_FAILED"));
    return { ok: false, error: "DISTANCE_LOOKUP_FAILED" };
  }
}

export async function getOrderInstallerDistancesAction(orderId: string): Promise<OrderInstallerDistancesResult> {
  const { errorResponse } = await requireAdminApi(0);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  try {
    const context = await loadOrderDistanceContext(orderId);
    if (!context?.address) return { ok: true, status: "NO_CUSTOMER_ADDRESS", distances: [] };

    const result = await getInstallerDistances({
      address: context.address,
      eligibleInstallerIds: context.eligibleInstallerIds,
    });
    return result.status === "OK"
      ? { ok: true, status: "OK", distances: result.eligible }
      : { ok: true, status: result.status, distances: [] };
  } catch (error) {
    console.error("[installation/distance/order]", getErrorMessage(error, "DISTANCE_LOOKUP_FAILED"));
    return { ok: false, error: "DISTANCE_LOOKUP_FAILED" };
  }
}
