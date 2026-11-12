import "server-only";

import { prisma } from "@/lib/prisma";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import { getCertStatus } from "@/lib/popbill/client";
import { isPopbillTaxInvoiceEnabled } from "@/lib/installer/popbill-tax-invoice";
import { currentYm, flowOf, formatYm, isSettlementLaunched, shiftYm } from "@/lib/installation/settlement/statements";

/**
 * 기사 정산 알림(매일 09:00 KST cron).
 * - 매달 8일: 지난달 정산서의 세금계산서를 아직 안 낸 기사에게 「10일까지 발행」 알림
 * - 매일: 팝빌 공동인증서 만료 30·14·7·3·1일 전 알림
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 날짜 "YYYY-MM-DD" */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 날짜 기준 남은 일수(같은 날 0) */
export function kstDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${kstDate(from)}T00:00:00Z`);
  const b = Date.parse(`${kstDate(to)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export const INVOICE_REMINDER_DAY = 8;
export const CERT_REMINDER_DAYS = [30, 14, 7, 3, 1] as const;

export type ReminderResult = { targets: number; sent: number; failed: number };

async function push(installerId: string, title: string, body: string): Promise<boolean> {
  try {
    await sendAssignmentPushToInstaller(installerId, { title, body });
    return true;
  } catch (error) {
    console.error("[settlement/reminders/push]", installerId, error);
    return false;
  }
}

/** 매달 8일: 지난달 정산서 중 세금계산서를 아직 안 냈거나 반려된 기사에게 알린다. 8일이 아니면 아무것도 안 한다. */
export async function sendInvoiceDeadlineReminders(now = new Date()): Promise<ReminderResult | null> {
  if (Number(kstDate(now).slice(8, 10)) !== INVOICE_REMINDER_DAY) return null;
  if (!(await isSettlementLaunched())) return null;

  const ym = shiftYm(currentYm(now), -1);
  const rows = await prisma.settlementStatement.findMany({
    where: { ym, paidAt: null, evidenceStatus: { in: ["PENDING", "REJECTED"] } },
    select: {
      installerId: true,
      taxDocType: true,
      evidenceStatus: true,
      installer: { select: { settlementInfo: { select: { taxDocType: true } } } },
    },
  });
  const byInstaller = new Map<string, { count: number; rejected: boolean }>();
  for (const r of rows) {
    if (flowOf(r.taxDocType ?? r.installer.settlementInfo?.taxDocType) !== "TAX") continue;
    const cur = byInstaller.get(r.installerId) ?? { count: 0, rejected: false };
    cur.count += 1;
    cur.rejected ||= r.evidenceStatus === "REJECTED";
    byInstaller.set(r.installerId, cur);
  }

  const [, m] = ym.split("-").map(Number);
  const deadline = `${(m % 12) + 1}월 10일`;
  let sent = 0;
  let failed = 0;
  for (const [installerId, v] of byInstaller) {
    const what = v.count > 1 ? `${formatYm(ym)} 정산서 ${v.count}장` : `${formatYm(ym)} 정산서`;
    const ok = await push(
      installerId,
      `세금계산서 발행 기한 ${deadline}`,
      `${what}의 세금계산서를 ${deadline}까지 발행해 주세요.${v.rejected ? " 반려된 건은 다시 제출해 주세요." : ""} 기한이 지나면 지연발행으로 가산세가 부과될 수 있습니다.`,
    );
    if (ok) sent += 1;
    else failed += 1;
  }
  return { targets: byInstaller.size, sent, failed };
}

/**
 * 팝빌 공동인증서 만료 알림. 만료 30·14·7·3·1일 전인 연동 완료 기사에게 보낸다.
 * 저장된 만료일은 마지막 확인 때 값이라, 보내기 전에 팝빌에 다시 물어 갱신한 기사는 건너뛴다.
 */
export async function sendCertExpiryReminders(now = new Date()): Promise<ReminderResult | null> {
  if (!(await isPopbillTaxInvoiceEnabled())) return null;

  const until = new Date(now.getTime() + (Math.max(...CERT_REMINDER_DAYS) + 1) * DAY_MS);
  const links = await prisma.installerPopbillLink.findMany({
    where: { status: "READY", certExpiresAt: { gt: now, lte: until } },
    select: { installerId: true, corpNum: true, certExpiresAt: true },
  });

  let targets = 0;
  let sent = 0;
  let failed = 0;
  for (const link of links) {
    let expiresAt = link.certExpiresAt!;
    if (!(CERT_REMINDER_DAYS as readonly number[]).includes(kstDaysBetween(now, expiresAt))) continue;

    // 이미 갱신했을 수 있다. 팝빌에서 다시 읽어 저장하고, 날짜가 바뀌었으면 그 날짜로 다시 판단한다.
    try {
      const cert = await getCertStatus(link.corpNum);
      if (cert.registered && cert.expiresAt) {
        expiresAt = cert.expiresAt;
        await prisma.installerPopbillLink.update({
          where: { installerId: link.installerId },
          data: { certExpiresAt: expiresAt, checkedAt: now },
        });
      }
    } catch (error) {
      console.error("[settlement/reminders/cert-refresh]", link.installerId, error);
    }
    const daysLeft = kstDaysBetween(now, expiresAt);
    if (!(CERT_REMINDER_DAYS as readonly number[]).includes(daysLeft)) continue;

    targets += 1;
    const ok = await push(
      link.installerId,
      `공동인증서 만료 ${daysLeft}일 전`,
      `팝빌에 등록한 공동인증서가 ${kstDate(expiresAt)}에 만료됩니다. 인증서를 갱신한 뒤 「내 정보 → 전자세금계산서 연동」에서 다시 등록해 주세요. 만료되면 앱에서 세금계산서를 발행할 수 없습니다.`,
    );
    if (ok) sent += 1;
    else failed += 1;
  }
  return { targets, sent, failed };
}
