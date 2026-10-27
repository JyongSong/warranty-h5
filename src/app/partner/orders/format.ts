import { formatKrPhone } from "@/lib/phone";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatPartnerDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

export function formatPartnerPhone(value: string | null | undefined) {
  return value ? formatKrPhone(value) : "-";
}

export function formatInstallSchedule(installDate: string | null, installTimeSlot: string | null) {
  if (!installDate) return "희망일 없음";
  return [installDate, installTimeSlot].filter(Boolean).join(" ");
}
