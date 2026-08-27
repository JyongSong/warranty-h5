import { isKoreanMobileNumber, isSafeVirtualNumber } from "@/lib/phone";
import { normalizePhone11 } from "@/lib/piiCrypto";
import {
  INSTALL_DATE_MAX_DAYS_AHEAD,
  INSTALL_DATE_MIN_DAYS_AHEAD,
} from "@/lib/installation/customer/timing";
import {
  parseInstallationAddress,
  splitInstallationSourceAddress,
} from "@/lib/installation/customer/address-parser";
import { InstallationCustomerRequestError } from "@/lib/installation/customer/errors";

// 자사(토큰 링크)와 CJ(공개 페이지) 양쪽 제출이 같은 규칙을 쓰도록 한곳에
// 모아 둔다. 한쪽에만 검증이 붙어 두 경로가 어긋나는 일을 막는 것이 목적이다.

export type CustomerSubmitInput = {
  installAddress: string;
  installAddressDetail?: string | null;
  installDate: string;
  installTimeSlot?: string | null;
  customerPhone: string;
  customerNote?: string | null;
};

export function normalizeCustomerRequestSubmitInput(input: CustomerSubmitInput, now: Date) {
  const installAddress = input.installAddress.trim();
  const installAddressDetail = input.installAddressDetail?.trim() || null;
  const installDate = input.installDate.trim();
  const installTimeSlot = input.installTimeSlot?.trim() || null;
  const customerPhone = normalizePhone11(input.customerPhone);
  const customerNote = input.customerNote?.trim() || null;

  if (!installAddress) {
    throw new InstallationCustomerRequestError("INSTALL_ADDRESS_REQUIRED");
  }
  const parsedAddress = parseInstallationAddress(installAddress);
  if (!parsedAddress) {
    throw new InstallationCustomerRequestError("INSTALL_ADDRESS_UNPARSEABLE");
  }
  const splitAddress = splitInstallationSourceAddress(installAddress);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate)) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_INVALID");
  }
  validateInstallDateRange(installDate, now);
  if (!customerPhone) {
    throw new InstallationCustomerRequestError("CUSTOMER_PHONE_REQUIRED");
  }
  // 주문 데이터에는 안심번호가 그대로 들어오므로 normalizePhone11 은 050 을
  // 허용한다(가져오기·폴백이 막히면 안 된다). 다만 고객이 직접 입력하는 이
  // 번호는 며칠 뒤 기사가 전화를 거는 용도라, 만료되는 번호를 받으면 안 된다.
  if (isSafeVirtualNumber(customerPhone)) {
    throw new InstallationCustomerRequestError("CUSTOMER_PHONE_IS_SAFE_NUMBER");
  }
  if (!isKoreanMobileNumber(customerPhone)) {
    throw new InstallationCustomerRequestError("CUSTOMER_PHONE_NOT_MOBILE");
  }

  return {
    installAddress,
    installAddressDetail,
    installAddress1: splitAddress?.address1 ?? null,
    installAddress2: splitAddress?.address2 ?? null,
    installDate,
    installTimeSlot,
    customerPhone,
    customerNote,
  };
}

function validateInstallDateRange(installDate: string, now: Date) {
  const targetDay = parseYmdToUtcDay(installDate);
  if (targetDay === null) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_INVALID");
  }

  const todayKst = getKstYmd(now);
  const minDay = addDaysToUtcDay(parseYmdToUtcDay(todayKst) as number, INSTALL_DATE_MIN_DAYS_AHEAD);
  const maxDay = addDaysToUtcDay(parseYmdToUtcDay(todayKst) as number, INSTALL_DATE_MAX_DAYS_AHEAD);

  if (targetDay < minDay || targetDay > maxDay) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_OUT_OF_RANGE");
  }
}

export function isInstallDateWithinDispatchWindow(installDate: string, now: Date) {
  const targetDay = parseYmdToUtcDay(installDate);
  if (targetDay === null) return false;

  const todayKst = getKstYmd(now);
  const todayDay = parseYmdToUtcDay(todayKst);
  if (todayDay === null) return false;

  return targetDay <= addDaysToUtcDay(todayDay, 10);
}

function getKstYmd(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new InstallationCustomerRequestError("INSTALL_DATE_INVALID");
  }

  return `${year}-${month}-${day}`;
}

function parseYmdToUtcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(date.getTime() / 86_400_000);
}

function addDaysToUtcDay(day: number, days: number) {
  return day + days;
}
