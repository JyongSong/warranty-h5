// IoT Pass 관리 화면(목록·추가·수정)이 함께 쓰는 타입·라벨·시각 변환.

import { formatBackofficeDateTime } from "@/lib/backoffice/table-formatting";

export type { IotPassItem } from "@/lib/iotPass";

export const PURCHASE_STATUS_OPTIONS = [
  { value: "pending", label: "미결제" },
  { value: "paid", label: "결제 완료" },
] as const;

export const PURCHASE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  PURCHASE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

// 기능 코드와 결제 수단은 표에 문자열로 들어간다. 값을 고정하면 나중에 다른
// 기능/결제처가 붙을 때 막히므로, 자주 쓰는 값만 입력 도우미로 띄운다.
export const FEATURE_CODE_SUGGESTIONS = ["zigbee"];

export const PAYMENT_PROVIDER_SUGGESTIONS = ["cafe24", "manual", "demo", "none"];

export const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  cafe24: "cafe24 주문",
  manual: "백오피스 수기",
  demo: "데모",
  none: "없음",
};

const KST_TIME_ZONE = "Asia/Seoul";

function kstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** 목록·상세에 보이는 시각. 백오피스 공용 변환기가 한국 시각으로 바꿔 준다. */
export function formatKstDateTime(iso: string | null | undefined): string {
  return formatBackofficeDateTime(iso);
}

/** datetime-local 입력칸 값(한국 시각 기준). */
export function toKstInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const { year, month, day, hour, minute } = kstParts(date);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** 입력칸 값을 한국 시각으로 해석해 ISO 로 되돌린다. 비어 있으면 null. */
export function fromKstInputValue(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  const date = new Date(`${text}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function readJson(res: Response) {
  return res.json().catch(() => ({}) as Record<string, unknown>);
}
