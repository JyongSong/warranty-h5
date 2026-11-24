"use server";

import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { BACKOFFICE_READ_ONLY_ERROR, canEditBackoffice } from "@/lib/login/backofficeRoles";
import {
  BROADCAST_LIMITS,
  listBroadcastRecipients,
  sendBroadcast,
  type BroadcastMode,
  type BroadcastRecipient,
  type BroadcastResult,
  type BroadcastScope,
} from "@/lib/installer/broadcast";

async function requireEditor() {
  const admin = await getCurrentBackofficeUser();
  if (!admin) return { ok: false as const, error: "UNAUTHORIZED" };
  if (!canEditBackoffice(admin.level)) return { ok: false as const, error: BACKOFFICE_READ_ONLY_ERROR };
  return { ok: true as const, admin };
}

export async function listBroadcastRecipientsAction(input: {
  scope: BroadcastScope;
  since?: string;
  includeInProgress?: boolean;
}): Promise<{ ok: true; recipients: BroadcastRecipient[] } | { ok: false; error: string }> {
  const auth = await requireEditor();
  if (!auth.ok) return auth;
  try {
    return { ok: true, recipients: await listBroadcastRecipients(input) };
  } catch (error) {
    console.error("[backoffice/broadcast/list]", error);
    return { ok: false, error: "LIST_FAILED" };
  }
}

const MODES: BroadcastMode[] = ["BOTH", "PUSH_ELSE_SMS", "PUSH_ONLY", "SMS_ONLY"];

export async function sendBroadcastAction(input: {
  installerIds: string[];
  mode: BroadcastMode;
  push: { title: string; body: string };
  sms: { subject: string; body: string };
  notice: { enabled: boolean; title: string; body: string };
}): Promise<({ ok: true } & BroadcastResult) | { ok: false; error: string }> {
  const auth = await requireEditor();
  if (!auth.ok) return auth;
  if (!MODES.includes(input.mode)) return { ok: false, error: "MODE_INVALID" };
  const L = BROADCAST_LIMITS;
  const push = { title: input.push.title.trim(), body: input.push.body.trim() };
  const sms = { subject: input.sms.subject.trim(), body: input.sms.body.trim() };
  const notice = { title: input.notice.title.trim(), body: input.notice.body.trim() };
  if (input.notice.enabled && (!notice.title || !notice.body)) return { ok: false, error: "NOTICE_REQUIRED" };
  if (notice.title.length > L.noticeTitle || notice.body.length > L.noticeBody) return { ok: false, error: "NOTICE_TOO_LONG" };
  const wantPush = input.mode !== "SMS_ONLY";
  const wantSms = input.mode !== "PUSH_ONLY";
  if (wantPush && (!push.title || !push.body)) return { ok: false, error: "PUSH_REQUIRED" };
  if (wantSms && !sms.body) return { ok: false, error: "SMS_REQUIRED" };
  if (push.title.length > L.pushTitle || push.body.length > L.pushBody) return { ok: false, error: "PUSH_TOO_LONG" };
  if (sms.subject.length > L.smsSubject || sms.body.length > L.smsBody) return { ok: false, error: "SMS_TOO_LONG" };
  const ids = Array.isArray(input.installerIds) ? input.installerIds.filter(Boolean) : [];
  if (ids.length === 0) return { ok: false, error: "NO_RECIPIENTS" };
  if (ids.length > L.recipients) return { ok: false, error: "TOO_MANY_RECIPIENTS" };
  try {
    const r = await sendBroadcast({
      installerIds: ids,
      mode: input.mode,
      push: wantPush ? push : undefined,
      sms: wantSms ? sms : undefined,
      notice: input.notice.enabled ? notice : undefined,
      adminId: auth.admin.id,
    });
    console.info("[backoffice/broadcast]", { admin: auth.admin.id, mode: input.mode, ...r, failed: r.failed.length });
    return { ok: true, ...r };
  } catch (error) {
    console.error("[backoffice/broadcast/send]", error);
    return { ok: false, error: "SEND_FAILED" };
  }
}
