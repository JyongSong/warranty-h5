import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const installerModelMigration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260623000000_add_backoffice/migration.sql"),
  "utf8",
);

describe("add backoffice Prisma migration", () => {
  it("creates assignment attempts with the final physical table name", () => {
    expect(installerModelMigration).toContain('CREATE TABLE "installation_installer_assignment_attempts"');
    expect(installerModelMigration).not.toContain("installation_installer_assignments");
  });

  it("creates backoffice settings with the final physical table name", () => {
    expect(installerModelMigration).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "backoffice_settings"/);
    expect(installerModelMigration).not.toContain('"backoffice_setting"');
    expect(installerModelMigration).not.toContain("system_settings");
  });

  it("does not recreate existing warranty service tables in production", () => {
    expect(installerModelMigration).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "shipped_devices"/);
    expect(installerModelMigration).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "warranty_registrations"/);
    expect(installerModelMigration).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "installers"/);
    expect(installerModelMigration).toContain('ALTER TABLE IF EXISTS "warranty_registrations"');
    expect(installerModelMigration).toContain('ALTER TABLE IF EXISTS "installers"');
  });

  it("is reset-safe and does not carry legacy table rename paths", () => {
    expect(installerModelMigration).not.toMatch(/\bRENAME TO\b/);
    expect(installerModelMigration).not.toMatch(/ALTER TYPE ".+"_old"/);
  });

  it("adds created timestamp when system settings become backoffice settings", () => {
    expect(installerModelMigration).toContain(
      '"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    );
  });

  it("allows repeated resolved issues while keeping one open issue per type", () => {
    expect(installerModelMigration).toMatch(
      /CREATE UNIQUE INDEX(?: IF NOT EXISTS)? "installation_issues_one_open_per_type_idx"/,
    );
    expect(installerModelMigration).toContain('WHERE "status" = \'OPEN\'');
  });

  it("constrains active pointers to rows from the same installation order", () => {
    expect(installerModelMigration).toContain(
      'FOREIGN KEY ("active_customer_request_id", "id") REFERENCES "installation_customer_requests"("id", "installation_order_id")',
    );
    expect(installerModelMigration).toContain(
      'FOREIGN KEY ("active_assignment_id", "id") REFERENCES "installation_installer_assignment_attempts"("id", "installation_order_id")',
    );
    expect(installerModelMigration).toContain(
      'FOREIGN KEY ("last_issue_id", "id") REFERENCES "installation_issues"("id", "installation_order_id")',
    );
  });
});
