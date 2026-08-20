import {
  renderCustomerInstallationSmsTemplate,
  renderInstallerInstallationSmsTemplate,
} from "@/lib/installation/notifications/sms-template";
import { formatKrPhone } from "@/lib/phone";
import { type AlimtalkRequest } from "@/lib/notifications/alimtalk";
import { FALLBACK_AFTER_HOURS } from "@/lib/installation/customer/timing";
import { INSTALLER_RESPONSE_TIMEOUT_HOURS } from "@/lib/installation/installer/timing";

export type InstallationSmsTemplateKey =
  | "customer_reservation_link"
  | "customer_reservation_reminder"
  | "installer_assignment_request"
  | "installer_happycall_guide"
  | "customer_assignment_confirmed";

export type InstallationSmsContent = {
  templateKey: InstallationSmsTemplateKey;
  /** LMS 제목. 비워두면 통신사가 본문 첫 줄을 잘라 제목으로 쓴다. */
  subject: string;
  text: string;
  /** 승인된 알림톡 템플릿이 있는 경우에만 채워진다. */
  alimtalk?: AlimtalkRequest;
};

/**
 * LMS 제목. 지정하지 않으면 통신사가 본문 첫 줄을 잘라 굵은 제목으로 붙여
 * 본문과 중복돼 보인다. 40바이트 제한이 있어 짧게 유지한다.
 */
const SUBJECT_BY_TEMPLATE_KEY: Record<InstallationSmsTemplateKey, string> = {
  customer_reservation_link: "[아카라라이프] 설치 예약 안내",
  customer_reservation_reminder: "[아카라라이프] 설치 예약 안내",
  customer_assignment_confirmed: "[아카라라이프] 설치 배정 완료",
  installer_assignment_request: "[아카라라이프] 설치 배정 요청",
  installer_happycall_guide: "[아카라라이프] 해피콜 안내",
};

/** outbox 는 DB 에 저장된 templateKey 만 갖고 있으므로 여기서 제목을 찾는다. */
export function getInstallationSmsSubject(templateKey: string | null | undefined) {
  if (!templateKey) return null;
  return SUBJECT_BY_TEMPLATE_KEY[templateKey as InstallationSmsTemplateKey] ?? null;
}

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
    subject: SUBJECT_BY_TEMPLATE_KEY[templateKey],
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
    subject: SUBJECT_BY_TEMPLATE_KEY[templateKey],
    text: renderCustomerInstallationSmsTemplate(templateKey, {
      productSummary: formatSmsProductSummary(productSummary),
      reservationUrl,
      // 7번과 같은 기준(설치 접수 시점)으로 안내해야 두 문자가 어긋나지 않는다.
      fallbackHours: String(FALLBACK_AFTER_HOURS),
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
    subject: SUBJECT_BY_TEMPLATE_KEY[templateKey],
    text: renderInstallerInstallationSmsTemplate(templateKey, {
      addressMain: addressMain?.trim() || "미확인",
      installDate: installDate?.trim() || "미확인",
      responseUrl,
      // 문안의 기한과 실제 타임아웃이 어긋나지 않도록 상수에서 렌더한다.
      responseTimeoutHours: String(INSTALLER_RESPONSE_TIMEOUT_HOURS),
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
    subject: SUBJECT_BY_TEMPLATE_KEY[templateKey],
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
    subject: SUBJECT_BY_TEMPLATE_KEY[templateKey],
    text: renderCustomerInstallationSmsTemplate(templateKey, {
      branchName: branchName?.trim() || "담당 지점",
      installerPhone: formatSmsPhone(installerPhone),
    }),
    // 5번(엑셀 일괄)과 같은 승인 템플릿을 쓴다.
    alimtalk: {
      templateKey: "assignment_completed",
      variables: {
        branchName: branchName?.trim() ?? null,
        installerPhone: installerPhone?.trim() ?? null,
      },
    },
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

/**
 * 알림 행에 저장할 알림톡 컬럼 값. 승인된 템플릿이 없는 종류는 null 이 되어
 * 발송 시 SMS 로만 나간다. 새 템플릿이 승인되면 해당 빌더에 alimtalk 을
 * 추가하는 것만으로 모든 생성 지점이 함께 바뀐다.
 */
export function toInstallationNotificationAlimtalkFields(content: InstallationSmsContent) {
  // Prisma 의 nullable Json 은 null 대입을 받지 않는다. 값이 없으면 아예
  // 넘기지 않아 컬럼이 NULL 로 들어가게 한다 (생성 시점에만 쓰는 헬퍼).
  if (!content.alimtalk) return {};

  return {
    alimtalkTemplateKey: content.alimtalk.templateKey,
    alimtalkVariables: Object.fromEntries(
      Object.entries(content.alimtalk.variables).map(([name, value]) => [name, value ?? ""]),
    ),
  };
}
