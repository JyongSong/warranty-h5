import { prisma } from "@/lib/prisma";
import { CJ_ORDER_PUSH_JOB } from "@/lib/cron/status";
import { sendSms } from "@/lib/sms";

// 회사 PC 가 매시 CJ 주문번호를 밀어 넣는다(scripts/cj-order-push.mjs).
// PC 가 꺼지거나 CJ 가 오류를 내면 우리 쪽에는 아무 요청도 오지 않으므로,
// 마지막 수신 시각(cron_job_statuses.last_called_at)이 오래되면 문자로 알린다.
//
// - 끊긴 지 CJ_PUSH_STALE_HOURS 시간이 되면 한 번 알린다(같은 장애 동안 반복하지 않음).
// - 알린 뒤 다시 들어오기 시작하면 복구 문자를 한 번 보낸다.
// - 받는 번호는 env CJ_PUSH_ALERT_PHONES(쉼표 구분). 비어 있으면 보내지 않는다.
// 알림 여부는 backoffice_settings 의 숨은 키에 남긴다(설정 화면에는 안 보임).

export const CJ_PUSH_STALE_HOURS = 10;
export const CJ_PUSH_ALERT_STATE_KEY = "cj.orderPush.alertSentAt";

export type CjPushWatchdogResult =
  | { state: "NEVER_RECEIVED" }
  | {
      state: "OK" | "STALE";
      lastReceivedAt: string;
      hoursSince: number;
      sent: "ALERT" | "RECOVERY" | null;
      recipients: number;
    };

export function parseAlertPhones(raw: string | undefined) {
  const phones = (raw ?? "")
    .split(",")
    .map((phone) => phone.replace(/\D/g, ""))
    .filter((phone) => phone.length >= 9);
  return Array.from(new Set(phones));
}

function formatKst(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString();
  return `${kst.slice(5, 10).replace("-", "/")} ${kst.slice(11, 16)}`;
}

export async function checkCjOrderPush({
  now = new Date(),
  phones = parseAlertPhones(process.env.CJ_PUSH_ALERT_PHONES),
}: { now?: Date; phones?: string[] } = {}): Promise<CjPushWatchdogResult> {
  const status = await prisma.cronJobStatus.findUnique({
    where: { key: CJ_ORDER_PUSH_JOB.key },
    select: { lastCalledAt: true },
  });
  // 한 번도 안 들어왔으면 아직 설치 전이다. 알리지 않는다.
  if (!status?.lastCalledAt) return { state: "NEVER_RECEIVED" };

  const lastReceivedAt = status.lastCalledAt;
  const hoursSince = Math.floor((now.getTime() - lastReceivedAt.getTime()) / (60 * 60 * 1000));
  const stale = hoursSince >= CJ_PUSH_STALE_HOURS;

  const alertRow = await prisma.backofficeSetting.findUnique({
    where: { key: CJ_PUSH_ALERT_STATE_KEY },
    select: { value: true },
  });
  const alerted = Boolean(alertRow?.value);

  let sent: "ALERT" | "RECOVERY" | null = null;
  // 받는 번호가 없으면 상태도 바꾸지 않는다(번호를 나중에 넣었을 때 이번 장애를 놓치지 않게).
  if (phones.length === 0) {
    // no-op
  } else if (stale && !alerted) {
    const text =
      `[CJ 주문번호 자동 수신 중단] ${hoursSince}시간째 회사 PC 에서 들어온 것이 없습니다. ` +
      `마지막 수신 ${formatKst(lastReceivedAt)}. ` +
      `PC 전원·인터넷과 작업 스케줄러 'CJ Order Push', C:\\cj-push\\push.log 를 확인해 주세요.`;
    await Promise.all(phones.map((phone) => sendSms(phone, text, "CJ 주문번호 수신 중단")));
    await prisma.backofficeSetting.upsert({
      where: { key: CJ_PUSH_ALERT_STATE_KEY },
      create: { key: CJ_PUSH_ALERT_STATE_KEY, value: now.toISOString(), updatedBy: "system" },
      update: { value: now.toISOString(), updatedBy: "system" },
    });
    sent = "ALERT";
  } else if (!stale && alerted) {
    const text = `[CJ 주문번호 자동 수신 복구] 회사 PC 에서 다시 들어오고 있습니다. 마지막 수신 ${formatKst(lastReceivedAt)}.`;
    await Promise.all(phones.map((phone) => sendSms(phone, text, "CJ 주문번호 수신 복구")));
    await prisma.backofficeSetting.deleteMany({ where: { key: CJ_PUSH_ALERT_STATE_KEY } });
    sent = "RECOVERY";
  }

  return {
    state: stale ? "STALE" : "OK",
    lastReceivedAt: lastReceivedAt.toISOString(),
    hoursSince,
    sent,
    recipients: phones.length,
  };
}
