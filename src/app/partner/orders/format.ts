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

export function formatClaimAmount(value: number | null | undefined) {
  return value == null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}

const STATUS_BADGE_TONE: Record<string, string> = {
  RECEIVED: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  COMPLETION_SUBMITTED: "bg-violet-100 text-violet-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  UNABLE: "bg-rose-100 text-rose-800",
};

export function partnerStatusBadgeClass(status: string | null | undefined) {
  return `inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
    STATUS_BADGE_TONE[status ?? ""] ?? "bg-zinc-100 text-zinc-700"
  }`;
}
