"use client";

import { useEffect, useState } from "react";
import { formatDistanceKm } from "@/lib/installation/distance/geo";
import { getAssignmentDistanceAction, type AssignmentDistanceResult } from "./distance-actions";

const STATUS_LABELS = {
  ADDRESS_NOT_FOUND: "고객 주소 확인 불가",
  NO_CUSTOMER_ADDRESS: "고객 주소 없음",
} as const;

export default function AssignmentDistanceCell({ orderId, installerId }: { orderId: string; installerId: string }) {
  const [result, setResult] = useState<AssignmentDistanceResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAssignmentDistanceAction(orderId, installerId)
      .catch((): AssignmentDistanceResult => ({ ok: false, error: "DISTANCE_LOOKUP_FAILED" }))
      .then((next) => {
        if (!cancelled) setResult(next);
      });
    return () => {
      cancelled = true;
    };
  }, [installerId, orderId]);

  if (!result) return <span className="text-zinc-400">거리 확인 중</span>;
  if (!result.ok) return <span className="text-zinc-500">거리 확인 실패</span>;
  if (result.status !== "OK") return <span className="text-zinc-500">{STATUS_LABELS[result.status]}</span>;

  const { candidate, closer } = result;
  return (
    <div className="whitespace-normal leading-5">
      <div className="font-semibold text-zinc-950">
        {candidate?.drivingMeters != null
          ? formatDistanceKm(candidate.drivingMeters)
          : candidate
            ? "경로 없음"
            : "기사 주소 없음"}
      </div>
      {closer.length > 0 ? (
        <div className="text-xs font-semibold text-amber-700">
          더 가까운 기사:{" "}
          {closer
            .map((installer) => `${installer.installerName} ${formatDistanceKm(installer.drivingMeters as number)}`)
            .join(", ")}
        </div>
      ) : null}
    </div>
  );
}
