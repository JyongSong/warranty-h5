import {
  renderCustomerInstallationSmsTemplate,
  renderInstallerInstallationSmsTemplate,
} from "@/lib/installation/notifications/sms-template";
import { formatKrPhone } from "@/lib/phone";
import { FALLBACK_AFTER_HOURS } from "@/lib/installation/customer/timing";

export type InstallationSmsContent = {
  templateKey:
    | "customer_reservation_link"
    | "customer_reservation_reminder"
    | "installer_assignment_request"
    | "installer_happycall_guide"
    | "customer_assignment_confirmed";
  text: string;
};

export function buildCustomerReservationLinkSmsContent({
  productSummary,
  reservationUrl,
}: {
  productSummary?: string | null;
  reservationUrl: string;
}): InstallationSmsContent {
  const templateKey = "customer_reservation_link";
  return {
    templateKey,
    text: renderCustomerInstallationSmsTemplate(templateKey, {
      productSummary: formatSmsProductSummary(productSummary),
      reservationUrl,
      // 문안의 시간과 실제 폴백 시점이 어긋나지 않도록 상수에서 렌더한다.
      fallbackHours: String(FALLBACK_AFTER_HOURS),
    }),
  };
}

export function buildCustomerReservationReminderSmsContent({
  productSummary,
  reservationUrl,
}: {
  productSummary?: string | null;
  reservationUrl: string;
}): InstallationSmsContent {
  const templateKey = "customer_reservation_reminder";
  return {
    templateKey,
    text: renderCustomerInstallationSmsTemplate(templateKey, {
      productSummary: formatSmsProductSummary(productSummary),
      reservationUrl,
    }),
  };
}

export function buildInstallerAssignmentRequestSmsContent({
  addressMain,
  installDate,
  responseUrl,
}: {
  addressMain?: string | null;
  installDate?: string | null;
  responseUrl: string;
}): InstallationSmsContent {
  const templateKey = "installer_assignment_request";
  return {
    templateKey,
    text: renderInstallerInstallationSmsTemplate(templateKey, {
      addressMain: addressMain?.trim() || "미확인",
      installDate: installDate?.trim() || "미확인",
      responseUrl,
    }),
  };
}

export function buildInstallerHappycallGuideSmsContent({
  address,
  customerPhone,
  installDate,
  productSummary,
}: {
  address?: string | null;
  customerPhone?: string | null;
  installDate?: string | null;
  productSummary?: string | null;
}): InstallationSmsContent {
  const templateKey = "installer_happycall_guide";
  return {
    templateKey,
    text: renderInstallerInstallationSmsTemplate(templateKey, {
      address: address?.trim() || "미확인",
      customerPhone: formatSmsPhone(customerPhone),
      installDate: installDate?.trim() || "미확인",
      productSummary: formatSmsProductSummary(productSummary),
    }),
  };
}

export function buildCustomerAssignmentConfirmedSmsContent({
  branchName,
  installerPhone,
}: {
  branchName?: string | null;
  installerPhone?: string | null;
} = {}): InstallationSmsContent {
  const templateKey = "customer_assignment_confirmed";
  return {
    templateKey,
    text: renderCustomerInstallationSmsTemplate(templateKey, {
      branchName: branchName?.trim() || "담당 지점",
      installerPhone: formatSmsPhone(installerPhone),
    }),
  };
}

function formatSmsProductSummary(value: string | null | undefined) {
  const products = (value ?? "")
    .split("/")
    .map((product) => product.trim())
    .filter(Boolean);

  if (products.length === 0) return "설치 상품";
  if (products.length === 1) return products[0];
  return `${products[0]} 외`;
}

function formatSmsPhone(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? formatKrPhone(trimmed) : "미확인";
}
