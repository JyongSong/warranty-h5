"use server";

import {
  SeminarRegistrationError,
  cancelSeminarRegistration,
  lookupSeminarRegistration,
  registerForSeminar,
  type SeminarLookup,
} from "@/lib/seminar/registration";

export type LookupResult = ({ ok: true } & SeminarLookup) | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

function toError(scope: string, error: unknown): { ok: false; error: string } {
  if (error instanceof SeminarRegistrationError) return { ok: false, error: error.message };
  console.error(`[i/s/${scope}]`, error);
  return { ok: false, error: "FAILED" };
}

/** 1단계: 번호로 초대 대상인지, 이미 신청했는지 확인한다. */
export async function lookupSeminarAction(slug: string, phone: string): Promise<LookupResult> {
  try {
    return { ok: true, ...(await lookupSeminarRegistration(slug, phone)) };
  } catch (error) {
    return toError("lookup", error);
  }
}

/** 2단계: 참석 신청. 정원·마감은 서버에서 다시 확인한다. */
export async function registerSeminarAction(slug: string, phone: string): Promise<ActionResult> {
  try {
    await registerForSeminar(slug, phone);
    return { ok: true };
  } catch (error) {
    return toError("register", error);
  }
}

export async function cancelSeminarAction(slug: string, phone: string): Promise<ActionResult> {
  try {
    await cancelSeminarRegistration(slug, phone);
    return { ok: true };
  } catch (error) {
    return toError("cancel", error);
  }
}
