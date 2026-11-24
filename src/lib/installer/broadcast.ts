import "server-only";

import type { InstallationOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { sendSmsWithResult } from "@/lib/sms";
import { createInboxNotices } from "@/lib/installer/inbox";

/**
 * 백오피스 「기사 공지 발송」: 고른 기사에게 앱 푸시·문자(LMS)를 보낸다.
 *
 * 대상 고르기
 * - WORKED: 기준일 이후 작업이 있는 기사(승인된 정산 라인 + 본사 확인 대기 중인 완료 건). 진행 중(배정·응답 대기) 포함은 선택.
 * - NOT_WORKED: WORKED 의 반대(같은 기준일·진행 중 포함 조건으로 작업이 없는 활동 기사).
 * - ALL: 활동 기사 전원.
 * 화면에서 체크를 풀어 뺄 수 있고, 서버는 받은 id 를 활동 기사로 다시 걸러서만 보낸다.
 */

export type BroadcastScope = "WORKED" | "NOT_WORKED" | "ALL";
export type BroadcastMode = "BOTH" | "PUSH_ELSE_SMS" | "PUSH_ONLY" | "SMS_ONLY";

export type BroadcastRecipient = {
  id: string;
  name: string;
  branch: string | null;
  phone: string;
  /** 푸시 받을 기기가 있는지 */
  app: boolean;
  /** WORKED 범위에서 작업 근거: DONE(완료·정산) | IN_PROGRESS(진행 중만) */
  reason: "DONE" | "IN_PROGRESS" | null;
  settlementInfo: string | null;
};

const IN_PROGRESS: InstallationOrderStatus[] = ["INSTALLER_ASSIGNED", "WAITING_INSTALLER_RESPONSE"];
const DONE_PENDING_REVIEW: InstallationOrderStatus[] = ["WAITING_HQ_REVIEW", "WAITING_ADMIN_REVIEW"];

export async function listBroadcastRecipients(input: {
  scope: BroadcastScope;
  /** WORKED 기준일(KST, YYYY-MM-DD) */
  since?: string;
  includeInProgress?: boolean;
}): Promise<BroadcastRecipient[]> {
  let reasons = new Map<string, "DONE" | "IN_PROGRESS">();
  if (input.scope === "WORKED" || input.scope === "NOT_WORKED") {
    const since = /^\d{4}-\d{2}-\d{2}$/.test(input.since ?? "") ? input.since! : "2026-10-01";
    const sinceAt = new Date(`${since}T00:00:00+09:00`);
    const [lines, reviewing, progressing] = await Promise.all([
      prisma.settlementLine.findMany({
        where: { completedAt: { gte: sinceAt } },
        select: { installerId: true },
        distinct: ["installerId"],
      }),
      prisma.installationOrder.findMany({
        where: { currentInstallerId: { not: null }, status: { in: DONE_PENDING_REVIEW } },
        select: { currentInstallerId: true },
        distinct: ["currentInstallerId"],
      }),
      input.includeInProgress
        ? prisma.installationOrder.findMany({
            where: { currentInstallerId: { not: null }, status: { in: IN_PROGRESS } },
            select: { currentInstallerId: true },
            distinct: ["currentInstallerId"],
          })
        : Promise.resolve([] as Array<{ currentInstallerId: string | null }>),
    ]);
    reasons = new Map();
    for (const r of progressing) if (r.currentInstallerId) reasons.set(r.currentInstallerId, "IN_PROGRESS");
    for (const r of [...lines.map((l) => l.installerId), ...reviewing.map((o) => o.currentInstallerId)])
      if (r) reasons.set(r, "DONE");
  }

  const installers = await prisma.installer.findMany({
    where: {
      active: true,
      ...(input.scope === "WORKED"
        ? { id: { in: [...reasons.keys()] } }
        : input.scope === "NOT_WORKED"
          ? { id: { notIn: [...reasons.keys()] } }
          : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      branch: true,
      phone: true,
      devices: { select: { id: true }, take: 1 },
      settlementInfo: { select: { status: true } },
    },
  });
  return installers.map((i) => ({
    id: i.id,
    name: i.name,
    branch: i.branch,
    phone: i.phone,
    app: i.devices.length > 0,
    reason: reasons.get(i.id) ?? null,
    settlementInfo: i.settlementInfo?.status ?? null,
  }));
}

export type BroadcastResult = {
  recipients: number;
  /** 앱 공지 팝업을 만든 기사 수 */
  noticeCreated: number;
  pushSent: number;
  smsSent: number;
  failed: Array<{ name: string; channel: "PUSH" | "SMS"; error: string }>;
};

export const BROADCAST_LIMITS = {
  pushTitle: 60,
  pushBody: 300,
  smsSubject: 40,
  smsBody: 1800,
  noticeTitle: 80,
  noticeBody: 4000,
  recipients: 500,
} as const;

export async function sendBroadcast(input: {
  installerIds: string[];
  mode: BroadcastMode;
  push?: { title: string; body: string };
  sms?: { subject: string; body: string };
  /** 앱 안 공지 팝업(받은 공지함). 앱 설치 여부와 관계없이 모든 대상에게 만든다(웹으로 들어와도 뜬다). */
  notice?: { title: string; body: string };
  adminId?: string | null;
}): Promise<BroadcastResult> {
  const ids = [...new Set(input.installerIds)].slice(0, BROADCAST_LIMITS.recipients);
  const targets = await prisma.installer.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, name: true, phone: true, devices: { select: { id: true }, take: 1 } },
  });
  const wantPush = input.mode !== "SMS_ONLY";
  const wantSms = input.mode !== "PUSH_ONLY";
  const result: BroadcastResult = { recipients: targets.length, noticeCreated: 0, pushSent: 0, smsSent: 0, failed: [] };
  // 공지를 먼저 만들어 둔다. 푸시를 눌러 앱을 열면 바로 팝업이 보이게.
  if (input.notice) {
    result.noticeCreated = await createInboxNotices({
      installerIds: targets.map((t) => t.id),
      title: input.notice.title,
      body: input.notice.body,
      adminId: input.adminId,
    });
  }

  for (const t of targets) {
    const hasApp = t.devices.length > 0;
    let pushed = false;
    if (wantPush && input.push && hasApp) {
      try {
        pushed = (await sendAssignmentPushToInstaller(t.id, input.push)) > 0;
        if (pushed) result.pushSent += 1;
        else result.failed.push({ name: t.name, channel: "PUSH", error: "기기 토큰 없음" });
      } catch (error) {
        console.error("[broadcast/push]", t.id, error);
        result.failed.push({ name: t.name, channel: "PUSH", error: "푸시 실패" });
      }
    }
    // PUSH_ELSE_SMS: 푸시가 안 간 기사만 문자
    const smsNeeded = wantSms && input.sms && (input.mode !== "PUSH_ELSE_SMS" || !pushed);
    if (smsNeeded && input.sms) {
      const r = await sendSmsWithResult(t.phone, input.sms.body, input.sms.subject || undefined);
      if (r.ok) result.smsSent += 1;
      else result.failed.push({ name: t.name, channel: "SMS", error: r.error });
    }
  }
  return result;
}
