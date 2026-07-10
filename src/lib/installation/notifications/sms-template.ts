import customerAssignmentConfirmedTemplate from "@/lib/installation/notifications/sms-template-customer-assignment-confirmed.json";
import customerReservationLinkTemplate from "@/lib/installation/notifications/sms-template-customer-reservation-link.json";
import customerReservationReminderTemplate from "@/lib/installation/notifications/sms-template-customer-reservation-reminder.json";
import installerAssignmentRequestTemplate from "@/lib/installation/notifications/sms-template-installer-assignment-request.json";
import installerHappycallGuideTemplate from "@/lib/installation/notifications/sms-template-installer-happycall-guide.json";

type CustomerTemplateKey =
  | "customer_reservation_link"
  | "customer_reservation_reminder"
  | "customer_assignment_confirmed";
type InstallerTemplateKey = "installer_assignment_request" | "installer_happycall_guide";

export function renderCustomerInstallationSmsTemplate(
  key: CustomerTemplateKey,
  vars: Record<string, string | null | undefined>,
) {
  return renderTemplate(getCustomerTemplateContent(key), vars);
}

export function renderInstallerInstallationSmsTemplate(
  key: InstallerTemplateKey,
  vars: Record<string, string | null | undefined>,
) {
  return renderTemplate(getInstallerTemplateContent(key), vars);
}

function getCustomerTemplateContent(key: CustomerTemplateKey) {
  switch (key) {
    case "customer_reservation_link":
      return customerReservationLinkTemplate.content;
    case "customer_reservation_reminder":
      return customerReservationReminderTemplate.content;
    case "customer_assignment_confirmed":
      return customerAssignmentConfirmedTemplate.content;
  }
}

function getInstallerTemplateContent(key: InstallerTemplateKey) {
  switch (key) {
    case "installer_assignment_request":
      return installerAssignmentRequestTemplate.content;
    case "installer_happycall_guide":
      return installerHappycallGuideTemplate.content;
  }
}

function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value == null || value === "" ? match : String(value);
  });
}
