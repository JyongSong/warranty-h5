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
