import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260716000000_secure_branch_tables_with_rls/migration.sql",
  ),
  "utf8",
);

const branchTables = [
  "cron_job_run_locks",
  "cron_job_statuses",
  "backoffice_settings",
  "backoffice_users",
  "installation_orders",
  "installation_order_sources",
  "installation_customer_requests",
  "installation_installer_assignment_attempts",
  "installation_installer_candidate_runs",
  "installation_installer_candidate_run_results",
  "installation_notifications",
  "installation_order_status_events",
  "installation_issues",
];

const revokeBlock = migration.match(
  /REVOKE ALL PRIVILEGES ON TABLE([\s\S]*?)FROM anon, authenticated;/,
)?.[1] ?? "";

describe("branch table RLS migration", () => {
  it.each(branchTables)("enables RLS on %s", (table) => {
    expect(migration).toContain(
      `ALTER TABLE IF EXISTS "${table}" ENABLE ROW LEVEL SECURITY;`,
    );
  });

  it.each(branchTables)("revokes Data API access from %s", (table) => {
    expect(revokeBlock).toContain(`"${table}"`);
  });

  it("revokes access only from client-facing Data API roles", () => {
    expect(migration).toContain("FROM anon, authenticated;");
    expect(migration).not.toMatch(/FROM[^;]*service_role/);
  });

  it("does not alter pre-existing or shared tables", () => {
    for (const table of [
      "installers",
      "warranty_registrations",
      "cafe24_tokens",
      "production_records",
      "survey_responses",
      "users",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`ALTER TABLE(?: IF EXISTS)? "${table}"`),
      );
    }
  });
});
