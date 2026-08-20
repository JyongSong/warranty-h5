import customerAssignmentConfirmedTemplate from "@/lib/installation/notifications/sms-template-customer-assignment-confirmed.json";
import customerReservationLinkTemplate from "@/lib/installation/notifications/sms-template-customer-reservation-link.json";
import customerReservationReminderTemplate from "@/lib/installation/notifications/sms-template-customer-reservation-reminder.json";
import installerAssignmentRequestTemplate from "@/lib/installation/notifications/sms-template-installer-assignment-request.json";
import installerHappycallGuideTemplate from "@/lib/installation/notifications/sms-template-installer-happycall-guide.json";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";
import { FALLBACK_AFTER_HOURS } from "@/lib/installation/customer/timing";

export type InstallationSmsTemplatePreviewKey =
  | "customer_reservation_link"
  | "customer_reservation_reminder"
  | "customer_assignment_confirmed"
  | "installer_assignment_request"
  | "installer_happycall_guide";

export type InstallationSmsTemplatePreview = {
  key: InstallationSmsTemplatePreviewKey;
  label: string;
  audience: "고객" | "기사";
  description: string;
  fileName: string;
  filePath: string;
  content: string;
  variables: string[];
  sampleVars: Record<string, string>;
};

const smsTemplatePath = "src/lib/installation/notifications/";
const fallbackPreviewBaseUrl = "https://example.com";

export function getInstallationSmsTemplatePreviews() {
  return createTemplateDefinitions(getPreviewSmsLinkBaseUrl());
}

export function renderInstallationSmsTemplatePreview(
  key: InstallationSmsTemplatePreviewKey,
  vars: Record<string, string | null | undefined>,
) {
  const template = getInstallationSmsTemplatePreviews().find((item) => item.key === key);

  if (!template) {
    throw new Error(`Unknown installation SMS template: ${key}`);
  }

  return renderTemplate(template.content, vars);
}

function createTemplateDefinitions(baseUrl: string): InstallationSmsTemplatePreview[] {
  return [
    {
      key: "customer_reservation_link",
      label: "고객 설치 예약 링크",
      audience: "고객",
      description: "고객에게 설치 희망 정보 입력 링크를 발송합니다.",
      fileName: "sms-template-customer-reservation-link.json",
      filePath: `${smsTemplatePath}sms-template-customer-reservation-link.json`,
      content: customerReservationLinkTemplate.content,
      variables: extractTemplateVariables(customerReservationLinkTemplate.content),
      sampleVars: {
        productSummary: "Aqara 스마트 도어락 K100 x1 / 용역 출장비 x1",
        reservationUrl: `${baseUrl}/i/c/customer-token`,
        fallbackHours: String(FALLBACK_AFTER_HOURS),
      },
    },
    {
      key: "customer_reservation_reminder",
      label: "고객 예약 입력 리마인드",
      audience: "고객",
      description: "설치 희망 정보 입력이 완료되지 않은 고객에게 다시 안내합니다.",
      fileName: "sms-template-customer-reservation-reminder.json",
      filePath: `${smsTemplatePath}sms-template-customer-reservation-reminder.json`,
      content: customerReservationReminderTemplate.content,
      variables: extractTemplateVariables(customerReservationReminderTemplate.content),
      sampleVars: {
        productSummary: "Aqara 스마트 도어락 K100 x1",
        reservationUrl: `${baseUrl}/i/c/reminder-token`,
        fallbackHours: String(FALLBACK_AFTER_HOURS),
      },
    },
    {
      key: "customer_assignment_confirmed",
      label: "고객 기사 배정 확정",
      audience: "고객",
      description: "설치 기사 배정이 확정되었음을 담당 기사 연락처와 함께 고객에게 알립니다.",
      fileName: "sms-template-customer-assignment-confirmed.json",
      filePath: `${smsTemplatePath}sms-template-customer-assignment-confirmed.json`,
      content: customerAssignmentConfirmedTemplate.content,
      variables: extractTemplateVariables(customerAssignmentConfirmedTemplate.content),
      sampleVars: {
        branchName: "강남점",
        installerPhone: "010-9999-0000",
      },
    },
    {
      key: "installer_assignment_request",
      label: "기사 설치 배정 요청",
      audience: "기사",
      description: "후보 기사에게 설치 배정 수락 여부를 요청합니다.",
      fileName: "sms-template-installer-assignment-request.json",
      filePath: `${smsTemplatePath}sms-template-installer-assignment-request.json`,
      content: installerAssignmentRequestTemplate.content,
      variables: extractTemplateVariables(installerAssignmentRequestTemplate.content),
      sampleVars: {
        installDate: "2026-06-20",
        addressMain: "서울 강남구",
        responseUrl: `${baseUrl}/i/i/installer-token`,
        responseDeadline: "8월 21일(금) 14시",
      },
    },
    {
      key: "installer_happycall_guide",
      label: "기사 확인 전화 안내",
      audience: "기사",
      description: "배정을 수락한 기사에게 고객 확인 전화 정보를 전달합니다.",
      fileName: "sms-template-installer-happycall-guide.json",
      filePath: `${smsTemplatePath}sms-template-installer-happycall-guide.json`,
      content: installerHappycallGuideTemplate.content,
      variables: extractTemplateVariables(installerHappycallGuideTemplate.content),
      sampleVars: {
        productSummary: "Aqara 스마트 도어락 K100 x1",
        installDate: "2026-06-20",
        address: "서울 강남구 테헤란로 1 12층 1201호",
        customerPhone: "01099990000",
      },
    },
  ];
}

function getPreviewSmsLinkBaseUrl() {
  try {
    return getSmsLinkBaseUrl();
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_PUBLIC_BASE_URL_MISSING") {
      return fallbackPreviewBaseUrl;
    }

    throw error;
  }
}

function extractTemplateVariables(content: string) {
  const variables = new Set<string>();

  for (const match of content.matchAll(/\{(\w+)\}/g)) {
    variables.add(match[1]);
  }

  return [...variables];
}

function renderTemplate(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value == null || value === "" ? match : String(value);
  });
}
