-- These tables are server-only. The application accesses them through Prisma's
-- direct Postgres connection, not through the Supabase Data API.
--
-- RLS provides default-deny row access, while revoking table privileges keeps
-- the tables out of the anon/authenticated Data API surface entirely.

ALTER TABLE IF EXISTS "cron_job_run_locks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "cron_job_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "backoffice_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "backoffice_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_order_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_customer_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_installer_assignment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_installer_candidate_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_installer_candidate_run_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_order_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installation_issues" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
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
  "installation_issues"
FROM anon, authenticated;
