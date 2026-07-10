import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("Prisma installation workflow schema", () => {
  it("defines the installation workflow models used by the application code", () => {
    expect(schema).toContain("model InstallationOrder ");
    expect(schema).toContain("model InstallationOrderSource ");
    expect(schema).toContain("model InstallationCustomerRequest ");
    expect(schema).toContain("model InstallationInstallerAssignmentAttempt ");
    expect(schema).toContain("model InstallationNotification ");
    expect(schema).toContain("model InstallationOrderStatusEvent ");
    expect(schema).toContain("model InstallationIssue ");
  });

  it("keeps the spec-required active assignment and notification uniqueness constraints", () => {
    expect(schema).toContain("@@unique([installationOrderId, assignmentNumber])");
    expect(schema).toMatch(/installerTokenHash\s+String\?\s+@unique/);
    expect(schema).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(schema).not.toContain("@@unique([installationOrderId, type, status])");
  });

  it("uses database enums for installation workflow statuses and issue types", () => {
    expect(schema).toContain("enum InstallationOrderStatus ");
    expect(schema).toContain("enum InstallationCustomerRequestStatus ");
    expect(schema).toContain("enum InstallationInstallerAssignmentStatus ");
    expect(schema).toContain("enum InstallationNotificationStatus ");
    expect(schema).toContain("enum InstallationIssueType ");
    expect(schema).toContain("enum InstallationIssueStatus ");
    expect(schema).not.toContain("enum InstallationIssueSeverity ");

    expect(schema).toMatch(/status\s+InstallationOrderStatus\s+@default\(CUSTOMER_INPUT_SMS_REQUIRED\)/);
    expect(schema).toMatch(/status\s+InstallationCustomerRequestStatus\s+@default\(PENDING_INPUT\)/);
    expect(schema).toMatch(/status\s+InstallationInstallerAssignmentStatus\s+@default\(WAITING_INSTALLER_RESPONSE\)/);
    expect(schema).toMatch(/status\s+InstallationNotificationStatus\s+@default\(PENDING\)/);
    expect(schema).toMatch(/type\s+InstallationIssueType/);
    expect(schema).not.toMatch(/severity\s+InstallationIssueSeverity/);
    expect(schema).toMatch(/status\s+InstallationIssueStatus\s+@default\(OPEN\)/);
    expect(schema).toMatch(/customerPhoneSource\s+String\s+@default\("PENDING_CUSTOMER"\)\s+@map\("customer_phone_source"\)/);
  });

  it("keeps installation order statuses limited to the schema-backed workflow states", () => {
    expect(getEnumValues("InstallationOrderStatus")).toEqual([
      "CUSTOMER_INPUT_SMS_REQUIRED",
      "WAITING_CUSTOMER_INPUT",
      "READY_FOR_CANDIDATE_SELECTION",
      "WAITING_ADMIN_REVIEW",
      "WAITING_INSTALLER_RESPONSE",
      "INSTALLER_ASSIGNED",
      "CANCELLED",
      "COMPLETED",
    ]);
  });

  it("keeps installation issue types limited to the operational failure definitions", () => {
    expect(getEnumValues("InstallationIssueType")).toEqual([
      "ORDER_CUSTOMER_PHONE_MISSING",
      "ORDER_CUSTOMER_PHONE_INVALID",
      "ORDER_PRODUCT_REQUIREMENT_UNMAPPED",
      "CUSTOMER_INPUT_NOT_SUBMITTED",
      "CUSTOMER_INPUT_ADDRESS_UNPARSABLE",
      "CUSTOMER_INPUT_LINK_SMS_SEND_FAILED",
      "INSTALLER_CANDIDATE_NOT_FOUND",
      "INSTALLER_CANDIDATE_EXHAUSTED",
      "INSTALLER_NOT_ASSIGNED",
      "INSTALLATION_NOT_COMPLETED",
      "INSTALLER_ASSIGNMENT_SMS_SEND_FAILED",
      "CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED",
    ]);
  });

  it("does not document unsupported installation order statuses", () => {
    const schemaStatuses = new Set(getEnumValues("InstallationOrderStatus"));
    const referencedStatuses = collectInstallationStatusReferences(join(process.cwd(), "docs/plans"));
    const unsupportedStatuses = [...referencedStatuses].filter((status) => !schemaStatuses.has(status));

    expect(unsupportedStatuses).not.toContain("MANUAL_REQUIRED");
  });

  it("links workflow pointer ids to their target tables with relations", () => {
    expect(schema).toMatch(
      /activeCustomerRequest\s+InstallationCustomerRequest\?\s+@relation\("ActiveCustomerRequest", fields: \[activeCustomerRequestId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(schema).toMatch(
      /activeAssignment\s+InstallationInstallerAssignmentAttempt\?\s+@relation\("ActiveAssignment", fields: \[activeAssignmentId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(schema).toMatch(
      /currentInstaller\s+Installer\?\s+@relation\("CurrentInstaller", fields: \[currentInstallerId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(schema).toMatch(
      /lastIssue\s+InstallationIssue\?\s+@relation\("LastIssue", fields: \[lastIssueId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(schema).toMatch(
      /customerRequest\s+InstallationCustomerRequest\?\s+@relation\(fields: \[customerRequestId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(schema).toMatch(
      /installer\s+Installer\s+@relation\(fields: \[installerId\], references: \[id\], onDelete: Restrict\)/,
    );
  });

  it("keeps composite keys available for same-order pointer constraints", () => {
    expect(getModelBlock("InstallationCustomerRequest")).toContain("@@unique([id, installationOrderId])");
    expect(getModelBlock("InstallationInstallerAssignmentAttempt")).toContain("@@unique([id, installationOrderId])");
    expect(getModelBlock("InstallationIssue")).toContain("@@unique([id, installationOrderId])");
  });

  it("stores fetched ERP installation order source rows without workflow-derived fields", () => {
    const sourceModel = getModelBlock("InstallationOrderSource");

    expect(sourceModel).toMatch(/sourceKey\s+String\s+@unique\s+@map\("source_key"\)/);
    expect(sourceModel).toMatch(/customerNameEncrypted\s+String\?\s+@map\("customer_name_encrypted"\)/);
    expect(sourceModel).toMatch(/customerNameHash\s+String\?\s+@map\("customer_name_hash"\)/);
    expect(sourceModel).toMatch(/phoneEncrypted\s+String\?\s+@map\("phone_encrypted"\)/);
    expect(sourceModel).toMatch(/phoneHash\s+String\?\s+@map\("phone_hash"\)/);
    expect(sourceModel).toMatch(/addressEncrypted\s+String\?\s+@map\("address_encrypted"\)/);
    expect(sourceModel).toMatch(/dueDate\s+String\?\s+@map\("due_date"\)/);
    expect(sourceModel).toMatch(/orderNumbers\s+String\?\s+@map\("order_numbers"\)/);
    expect(sourceModel).toMatch(/noGirl\s+String\?\s+@map\("no_girl"\)/);
    expect(sourceModel).toMatch(/memo\s+String\?\s+@db\.Text/);
    expect(sourceModel).toMatch(/@@index\(\[dueDate\]\)/);
    expect(sourceModel).toMatch(/@@map\("installation_order_sources"\)/);

    expect(sourceModel).not.toContain("validationErrorCode");
    expect(sourceModel).not.toContain("fetchedAt");
    expect(sourceModel).not.toContain("addressMainEncrypted");
    expect(sourceModel).not.toContain("addressDetailEncrypted");
    expect(sourceModel).not.toContain("address1Encrypted");
    expect(sourceModel).not.toContain("address2Encrypted");
    expect(sourceModel).not.toContain("requiredCapabilities");
    expect(sourceModel).not.toContain("requiredAqaraAppCapability");
  });

  it("keeps installation orders linked to source rows without duplicated source columns", () => {
    const orderModel = getModelBlock("InstallationOrder");

    expect(orderModel).toMatch(/sourceId\s+String\?\s+@unique\s+@map\("source_id"\)/);
    expect(orderModel).toMatch(
      /source\s+InstallationOrderSource\?\s+@relation\(fields: \[sourceId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(orderModel).not.toMatch(/@@index\(\[sourceId\]\)/);

    expect(orderModel).not.toContain("sourceErpOrderNo");
    expect(orderModel).not.toContain("sourceCustomerNameEncrypted");
    expect(orderModel).not.toContain("sourceCustomerNameHash");
    expect(orderModel).not.toContain("sourcePhoneEncrypted");
    expect(orderModel).not.toContain("sourcePhoneHash");
    expect(orderModel).not.toContain("sourceAddressEncrypted");
    expect(orderModel).not.toContain("sourceAddressMainEncrypted");
    expect(orderModel).not.toContain("sourceAddressDetailEncrypted");
    expect(orderModel).not.toContain("sourceAddress1Encrypted");
    expect(orderModel).not.toContain("sourceAddress2Encrypted");
    expect(orderModel).not.toContain("sourceExternalOrderNumbers");
    expect(orderModel).not.toContain("sourceNoGirl");
    expect(orderModel).not.toContain("sourceOrderDate");
    expect(orderModel).not.toContain("sourceInstallDate");
    expect(orderModel).not.toContain("sourceMemo");
    expect(orderModel).not.toContain("sourceValidationErrorCode");
    expect(orderModel).not.toContain("sourceItemsJsonText");
    expect(orderModel).not.toContain("requiredCapabilities");
    expect(orderModel).not.toContain("requiredAqaraAppCapability");
  });

  it("stores customer requested install date and time slot separately", () => {
    expect(schema).toMatch(/installDate\s+String\?\s+@map\("install_date"\)/);
    expect(schema).toMatch(/installTimeSlot\s+String\?\s+@map\("install_time_slot"\)/);
    expect(schema).toMatch(/customerNote\s+String\?\s+@map\("customer_note"\)/);
  });

  it("maps workflow tables to names that match their model semantics", () => {
    expect(getModelBlock("InstallationCustomerRequest")).toMatch(/@@map\("installation_customer_requests"\)/);
    expect(getModelBlock("InstallationInstallerAssignmentAttempt")).toMatch(/@@map\("installation_installer_assignment_attempts"\)/);
    expect(getModelBlock("InstallationInstallerCandidateRun")).toMatch(/@@map\("installation_installer_candidate_runs"\)/);
  });

  it("maps backoffice settings to the requested physical table name", () => {
    expect(getModelBlock("BackofficeSetting")).toMatch(/@@map\("backoffice_settings"\)/);
  });

  it("tracks when backoffice settings were created", () => {
    expect(getModelBlock("BackofficeSetting")).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
  });

  it("names encrypted PII columns explicitly", () => {
    expect(schema).toMatch(/emailEncrypted\s+String\s+@unique\s+@map\("email_encrypted"\)/);
    expect(schema).not.toMatch(/email\s+String\s+@unique/);
    expect(schema).toMatch(/emailHash\s+String\?\s+@unique\s+@map\("email_hash"\)/);
    expect(schema).toMatch(/customerNameEncrypted\s+String\?\s+@map\("customer_name_encrypted"\)/);
    expect(schema).toMatch(/customerPhoneEncrypted\s+String\?\s+@map\("customer_phone_encrypted"\)/);
    expect(schema).toMatch(/installAddressEncrypted\s+String\?\s+@map\("install_address_encrypted"\)/);
    expect(schema).toMatch(/installAddressDetailEncrypted\s+String\?\s+@map\("install_address_detail_encrypted"\)/);
    expect(schema).toMatch(/recipientPhoneEncrypted\s+String\?\s+@map\("recipient_phone_encrypted"\)/);

    expect(schema).not.toMatch(/sourceCustomerName\s+String\?\s+@map\("source_customer_name"\)/);
    expect(schema).not.toMatch(/sourcePhone\s+String\?\s+@map\("source_phone"\)/);
    expect(schema).not.toMatch(/customerName\s+String\?\s+@map\("customer_name"\)/);
    expect(schema).not.toMatch(/customerPhone\s+String\?\s+@map\("customer_phone"\)/);
    expect(schema).not.toMatch(/installAddress\s+String\?\s+@map\("install_address"\)/);
    expect(schema).not.toMatch(/installAddressDetail\s+String\?\s+@map\("install_address_detail"\)/);
    expect(schema).not.toMatch(/recipientPhone\s+String\?\s+@map\("recipient_phone"\)/);
  });

  it("only keeps hash columns for searchable names and full phone numbers", () => {
    expect(schema).toMatch(/customerNameHash\s+String\?\s+@map\("customer_name_hash"\)/);
    expect(schema).toMatch(/customerPhoneHash\s+String\?\s+@map\("customer_phone_hash"\)/);
    expect(schema).toMatch(/recipientPhoneHash\s+String\?\s+@map\("recipient_phone_hash"\)/);

    expect(schema).toMatch(/emailHash\s+String\?\s+@unique\s+@map\("email_hash"\)/);
  });

  it("stores customer request address parts encrypted without sido or sigungu columns", () => {
    expect(schema).toMatch(/installAddress1Encrypted\s+String\?\s+@map\("install_address1_encrypted"\)/);
    expect(schema).toMatch(/installAddress2Encrypted\s+String\?\s+@map\("install_address2_encrypted"\)/);
    expect(schema).not.toMatch(/installSido\s+String\?\s+@map\("install_sido"\)/);
    expect(schema).not.toMatch(/installSigungu\s+String\?\s+@map\("install_sigungu"\)/);
  });
});

function getModelBlock(modelName: string) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  if (!match) return "";
  return match[0];
}

function getEnumValues(enumName: string) {
  const match = schema.match(new RegExp(`enum ${enumName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) return [];

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .map((line) => line.split(/\s+/)[0]);
}

function collectInstallationStatusReferences(directory: string) {
  const references = new Set<string>();
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const nestedReference of collectInstallationStatusReferences(absolutePath)) {
        references.add(nestedReference);
      }
      continue;
    }

    if (!entry.endsWith(".md") && !entry.endsWith(".json")) continue;
    const content = readFileSync(absolutePath, "utf8");
    for (const match of content.matchAll(/`([A-Z][A-Z0-9_]+)`|"([A-Z][A-Z0-9_]+)"/g)) {
      const value = match[1] ?? match[2];
      if (value.includes("INSTALLATION") || value.includes("INSTALLER")) continue;
      references.add(value);
    }
  }

  return references;
}
