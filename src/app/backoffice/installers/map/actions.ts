"use server";

import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import type { GeoPoint } from "@/lib/installation/distance/geo";
import {
  getInstallerDistances,
  pickNearestInstallers,
  syncInstallerCoordinates,
  type InstallerDistance,
} from "@/lib/installation/distance/service";

const NEAREST_INSTALLER_LIMIT = 2;

export type SearchNearestInstallersResult =
  | { ok: true; customer: GeoPoint; nearest: InstallerDistance[] }
  | { ok: false; error: "UNAUTHORIZED" | "ADDRESS_REQUIRED" | "ADDRESS_NOT_FOUND" | "DISTANCE_LOOKUP_FAILED" };

export type SyncInstallerCoordinatesResult =
  | { ok: true; processedCount: number; remainingCount: number }
  | { ok: false; error: string };

export async function searchNearestInstallersAction(address: string): Promise<SearchNearestInstallersResult> {
  const { errorResponse } = await requireAdminApi("view");
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };
  if (!address.trim()) return { ok: false, error: "ADDRESS_REQUIRED" };

  try {
    const result = await getInstallerDistances({ address });
    if (result.status !== "OK") return { ok: false, error: "ADDRESS_NOT_FOUND" };

    return {
      ok: true,
      customer: result.customer,
      nearest: pickNearestInstallers(result.eligible, NEAREST_INSTALLER_LIMIT),
    };
  } catch (error) {
    console.error("[installation/distance/search]", getErrorMessage(error, "DISTANCE_LOOKUP_FAILED"));
    return { ok: false, error: "DISTANCE_LOOKUP_FAILED" };
  }
}

export async function syncInstallerCoordinatesAction(): Promise<SyncInstallerCoordinatesResult> {
  const { errorResponse } = await requireAdminApi("edit");
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  try {
    return { ok: true, ...(await syncInstallerCoordinates()) };
  } catch (error) {
    console.error("[installation/distance/sync]", getErrorMessage(error, "COORDINATE_SYNC_FAILED"));
    return { ok: false, error: getErrorMessage(error, "COORDINATE_SYNC_FAILED") };
  }
}
