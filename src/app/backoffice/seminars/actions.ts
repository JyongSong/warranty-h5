"use server";

import { requireAdminApi } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

type ActionResult = { ok: true } | { ok: false; error: string };

/** 접수를 직접 닫거나 다시 연다. 다시 열어도 정원·마감 시각은 그대로 적용된다. */
export async function setSeminarManuallyClosedAction(
  seminarId: string,
  manuallyClosed: boolean,
): Promise<ActionResult> {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  const { count } = await prisma.seminar.updateMany({
    where: { id: String(seminarId ?? "") },
    data: { manuallyClosed: Boolean(manuallyClosed) },
  });
  return count === 0 ? { ok: false, error: "NOT_FOUND" } : { ok: true };
}

/**
 * 관리자가 한 사람의 신청을 취소한다(같은 업체에서 두 명이 신청한 경우 등).
 * 본인 취소와 달리 마감 시각 뒤에도 할 수 있다. 문자는 보내지 않는다.
 */
export async function cancelSeminarRegistrationAction(registrationId: string): Promise<ActionResult> {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  const { count } = await prisma.seminarRegistration.updateMany({
    where: { id: String(registrationId ?? ""), cancelledAt: null },
    data: { cancelledAt: new Date(), cancelledBy: "ADMIN" },
  });
  return count === 0 ? { ok: false, error: "NOT_FOUND" } : { ok: true };
}
