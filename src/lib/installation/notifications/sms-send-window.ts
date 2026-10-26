const SMS_TIME_ZONE = "Asia/Seoul";

const seoulTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SMS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isInstallationSmsSendWindowOpen(
  now: Date,
  window: { start: string; end: string },
) {
  const currentMinutes = getSeoulMinutes(now);
  const startMinutes = parseTime(window.start);
  const endMinutes = parseTime(window.end);

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * 기사에게 새 배정 알림(첫 알림)을 보내도 되는 시간인지.
 *
 * 응답 마감은 첫 알림 시점부터 responseHours 뒤다. 마감이 발송 시간대 밖(밤)에
 * 걸리면 폴백 문자도 못 나간 채 밤사이 다음 기사에게 넘어가므로, 마감이 시간대
 * 안에 끝나는 시각까지만 첫 알림을 보낸다. 기본값(08:00~20:00, 5시간)이면
 * 15:00 이후 배정은 다음 날 08:00 에 알린다.
 *
 * 시간대가 자정을 넘거나 응답 시간보다 짧으면 따로 막지 않는다(발송 시간대 판정만 따른다).
 */
export function isInstallerAssignmentFirstNotificationOpen(
  now: Date,
  window: { start: string; end: string },
  responseHours: number,
) {
  if (!isInstallationSmsSendWindowOpen(now, window)) return false;

  const startMinutes = parseTime(window.start);
  const endMinutes = parseTime(window.end);
  const lastStartMinutes = endMinutes - responseHours * 60;
  if (startMinutes > endMinutes || lastStartMinutes <= startMinutes) return true;

  return getSeoulMinutes(now) <= lastStartMinutes;
}

function getSeoulMinutes(now: Date) {
  const parts = seoulTimeFormatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
