-- Production-safe additive migration for the installer assignment workflow.
-- Existing warranty tables may already exist in production, so this migration
-- only adds missing columns/indexes there and creates new workflow tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "InstallationOrderStatus" AS ENUM (
    'CUSTOMER_INPUT_SMS_REQUIRED',
    'WAITING_CUSTOMER_INPUT',
    'READY_FOR_CANDIDATE_SELECTION',
    'WAITING_ADMIN_REVIEW',
    'WAITING_INSTALLER_RESPONSE',
    'INSTALLER_ASSIGNED',
    'CANCELLED',
    'COMPLETED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallationCustomerRequestStatus" AS ENUM (
    'PENDING_INPUT',
    'SUBMITTED',
    'FALLBACK_USED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallationInstallerAssignmentStatus" AS ENUM (
    'WAITING_ADMIN_REVIEW',
    'WAITING_INSTALLER_RESPONSE',
    'INSTALLER_ACCEPTED',
    'INSTALLER_REJECTED',
    'INSTALLER_RESPONSE_TIMED_OUT',
    'ADMIN_MANUAL_OVERRIDDEN',
    'ADMIN_COMPLETED',
    'SYSTEM_SMS_RETRY_PENDING',
    'SYSTEM_SMS_FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallationNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallationIssueType" AS ENUM (
    'ORDER_CUSTOMER_PHONE_MISSING',
    'ORDER_CUSTOMER_PHONE_INVALID',
    'ORDER_PRODUCT_REQUIREMENT_UNMAPPED',
    'CUSTOMER_INPUT_NOT_SUBMITTED',
    'CUSTOMER_INPUT_ADDRESS_UNPARSABLE',
    'CUSTOMER_INPUT_LINK_SMS_SEND_FAILED',
    'INSTALLER_CANDIDATE_NOT_FOUND',
    'INSTALLER_CANDIDATE_EXHAUSTED',
    'INSTALLER_NOT_ASSIGNED',
    'INSTALLATION_NOT_COMPLETED',
    'INSTALLER_ASSIGNMENT_SMS_SEND_FAILED',
    'CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallationIssueStatus" AS ENUM ('OPEN', 'RESOLVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Existing tables from the original warranty service.
ALTER TABLE IF EXISTS "shipped_devices"
  ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE IF EXISTS "warranty_registrations"
  ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text,
  ALTER COLUMN "installer_phone" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "install_type" TEXT NOT NULL DEFAULT 'installer',
  ADD COLUMN IF NOT EXISTS "consent_marketing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "survey_sent_at" TIMESTAMP(3);

ALTER TABLE IF EXISTS "warranty_registrations"
  ALTER COLUMN "confirm_token_expires_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "submitted_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "confirmed_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS "installers"
  ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text,
  ADD COLUMN IF NOT EXISTS "ability" TEXT,
  ADD COLUMN IF NOT EXISTS "install_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "happy_call_lt" INTEGER,
  ADD COLUMN IF NOT EXISTS "defect_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "dissatisfaction_note" TEXT,
  ADD COLUMN IF NOT EXISTS "service_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "aqara_app_capability" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "has_aqara_hub_inventory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "monthly_dispatch_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS "installers"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "admins" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "login_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sms_templates" (
  "key" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT,
  CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "cron_job_run_locks" (
  "key" TEXT NOT NULL,
  "locked_until" TIMESTAMP(3) NOT NULL,
  "locked_by" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cron_job_run_locks_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "cron_job_statuses" (
  "key" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "schedule" TEXT,
  "last_called_at" TIMESTAMP(3),
  "last_started_at" TIMESTAMP(3),
  "last_finished_at" TIMESTAMP(3),
  "last_status" TEXT,
  "last_duration_ms" INTEGER,
  "last_error_code" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cron_job_statuses_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "satisfaction_surveys" (
  "id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "q1_1" TEXT NOT NULL,
  "q1_2" TEXT NOT NULL,
  "q1_3" TEXT NOT NULL,
  "q2_1" TEXT NOT NULL,
  "q2_2" TEXT NOT NULL,
  "q2_3" TEXT NOT NULL,
  "q3_1" INTEGER NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "satisfaction_surveys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "backoffice_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT,
  CONSTRAINT "backoffice_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "backoffice_users" (
  "id" TEXT NOT NULL,
  "supabase_user_id" TEXT,
  "email_encrypted" TEXT NOT NULL,
  "email_hash" TEXT,
  "level" INTEGER NOT NULL DEFAULT 0,
  "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backoffice_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_orders" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "source_id" TEXT,
  "status" "InstallationOrderStatus" NOT NULL DEFAULT 'CUSTOMER_INPUT_SMS_REQUIRED',
  "active_customer_request_id" TEXT,
  "active_assignment_id" TEXT,
  "current_installer_id" TEXT,
  "has_open_issue" BOOLEAN NOT NULL DEFAULT false,
  "last_issue_id" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_order_sources" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "source_key" TEXT NOT NULL,
  "customer_name_encrypted" TEXT,
  "customer_name_hash" TEXT,
  "phone_encrypted" TEXT,
  "phone_hash" TEXT,
  "address_encrypted" TEXT,
  "due_date" TEXT,
  "order_numbers" TEXT,
  "no_girl" TEXT,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_order_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_customer_requests" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "request_number" INTEGER NOT NULL,
  "customer_name_encrypted" TEXT,
  "customer_name_hash" TEXT,
  "customer_phone_encrypted" TEXT,
  "customer_phone_hash" TEXT,
  "customer_phone_source" TEXT NOT NULL DEFAULT 'PENDING_CUSTOMER',
  "install_address_encrypted" TEXT,
  "install_address_detail_encrypted" TEXT,
  "install_address1_encrypted" TEXT,
  "install_address2_encrypted" TEXT,
  "install_date" TEXT,
  "install_time_slot" TEXT,
  "customer_note" TEXT,
  "customer_token_hash" TEXT NOT NULL,
  "customer_token_expires_at" TIMESTAMP(3) NOT NULL,
  "customer_submitted_at" TIMESTAMP(3),
  "fallback_used" BOOLEAN NOT NULL DEFAULT false,
  "status" "InstallationCustomerRequestStatus" NOT NULL DEFAULT 'PENDING_INPUT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_customer_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_installer_assignment_attempts" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "customer_request_id" TEXT,
  "installer_id" TEXT NOT NULL,
  "assignment_number" INTEGER NOT NULL,
  "assignment_source" TEXT NOT NULL DEFAULT 'AUTO',
  "match_tier" TEXT,
  "candidate_rank" INTEGER,
  "selection_snapshot" JSONB,
  "installer_token_hash" TEXT,
  "installer_token_expires_at" TIMESTAMP(3),
  "status" "InstallationInstallerAssignmentStatus" NOT NULL DEFAULT 'WAITING_INSTALLER_RESPONSE',
  "installer_notified_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "reject_reason" TEXT,
  "timed_out_at" TIMESTAMP(3),
  "created_by_admin_id" TEXT,
  "approved_by_admin_id" TEXT,
  "cancelled_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_installer_assignment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_installer_candidate_runs" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "customer_request_id" TEXT,
  "assignment_source" TEXT NOT NULL DEFAULT 'AUTO',
  "reason_code" TEXT,
  "input_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installation_installer_candidate_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_installer_candidate_run_results" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "candidate_run_id" TEXT NOT NULL,
  "installer_id" TEXT NOT NULL,
  "rank" INTEGER,
  "is_auto_request_candidate" BOOLEAN NOT NULL DEFAULT false,
  "region_tier" TEXT,
  "monthly_dispatch_count" INTEGER NOT NULL DEFAULT 0,
  "last_requested_at" TIMESTAMP(3),
  "excluded_reason" TEXT,
  "decision_reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installation_installer_candidate_run_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_notifications" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "customer_request_id" TEXT,
  "installation_assignment_id" TEXT,
  "sms_type" TEXT NOT NULL,
  "recipient_type" TEXT NOT NULL,
  "recipient_phone_encrypted" TEXT,
  "recipient_phone_hash" TEXT,
  "sms_template_key" TEXT,
  "sms_body" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'solapi',
  "provider_message_id" TEXT,
  "status" "InstallationNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "error_code" TEXT,
  "error_message" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_order_status_events" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "from_status" "InstallationOrderStatus",
  "to_status" "InstallationOrderStatus" NOT NULL,
  "event_type" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installation_order_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "installation_issues" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "type" "InstallationIssueType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "status" "InstallationIssueStatus" NOT NULL DEFAULT 'OPEN',
  "resolved_by_admin_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installation_issues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shipped_devices_sn_key" ON "shipped_devices"("sn");
CREATE UNIQUE INDEX IF NOT EXISTS "warranty_registrations_sn_key" ON "warranty_registrations"("sn");
CREATE UNIQUE INDEX IF NOT EXISTS "warranty_registrations_confirm_token_key" ON "warranty_registrations"("confirm_token");
CREATE INDEX IF NOT EXISTS "warranty_registrations_status_idx" ON "warranty_registrations"("status");
CREATE INDEX IF NOT EXISTS "idx_reg_installer_phone" ON "warranty_registrations"("installer_phone");
CREATE INDEX IF NOT EXISTS "idx_reg_sn" ON "warranty_registrations"("sn");
CREATE INDEX IF NOT EXISTS "idx_reg_status" ON "warranty_registrations"("status");
CREATE INDEX IF NOT EXISTS "idx_reg_submitted_at" ON "warranty_registrations"("submitted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "installers_phone_key" ON "installers"("phone");
CREATE INDEX IF NOT EXISTS "installers_branch_idx" ON "installers"("branch");
CREATE INDEX IF NOT EXISTS "installers_region_idx" ON "installers"("region");
CREATE INDEX IF NOT EXISTS "installers_active_idx" ON "installers"("active");
CREATE INDEX IF NOT EXISTS "installers_capabilities_gin_idx" ON "installers" USING GIN ("capabilities");
CREATE INDEX IF NOT EXISTS "installers_service_areas_gin_idx" ON "installers" USING GIN ("service_areas");
CREATE UNIQUE INDEX IF NOT EXISTS "admins_login_code_key" ON "admins"("login_code");
CREATE INDEX IF NOT EXISTS "admins_level_idx" ON "admins"("level");
CREATE UNIQUE INDEX IF NOT EXISTS "satisfaction_surveys_registration_id_key" ON "satisfaction_surveys"("registration_id");
CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_users_supabase_user_id_key" ON "backoffice_users"("supabase_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_users_email_encrypted_key" ON "backoffice_users"("email_encrypted");
CREATE UNIQUE INDEX IF NOT EXISTS "backoffice_users_email_hash_key" ON "backoffice_users"("email_hash");
CREATE INDEX IF NOT EXISTS "backoffice_users_level_idx" ON "backoffice_users"("level");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_orders_source_id_key" ON "installation_orders"("source_id");
CREATE INDEX IF NOT EXISTS "installation_orders_status_created_at_idx" ON "installation_orders"("status", "created_at");
CREATE INDEX IF NOT EXISTS "installation_orders_status_status_changed_at_idx" ON "installation_orders"("status", "status_changed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_order_sources_source_key_key" ON "installation_order_sources"("source_key");
CREATE INDEX IF NOT EXISTS "installation_order_sources_due_date_idx" ON "installation_order_sources"("due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_customer_requests_customer_token_hash_key" ON "installation_customer_requests"("customer_token_hash");
CREATE INDEX IF NOT EXISTS "installation_customer_requests_status_idx" ON "installation_customer_requests"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_customer_requests_installation_order_id_reques_key" ON "installation_customer_requests"("installation_order_id", "request_number");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_customer_requests_id_installation_order_id_key" ON "installation_customer_requests"("id", "installation_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_installer_assignment_attempts_installer_token_hash_key" ON "installation_installer_assignment_attempts"("installer_token_hash");
CREATE INDEX IF NOT EXISTS "installation_installer_assignment_attempts_status_created_at_idx" ON "installation_installer_assignment_attempts"("status", "created_at");
CREATE INDEX IF NOT EXISTS "installation_installer_assignment_attempts_installer_id_created_at_idx" ON "installation_installer_assignment_attempts"("installer_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_installer_assignment_attempts_installation_order_id_assi_key" ON "installation_installer_assignment_attempts"("installation_order_id", "assignment_number");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_installer_assignment_attempts_id_installation_order_id_key" ON "installation_installer_assignment_attempts"("id", "installation_order_id");
CREATE INDEX IF NOT EXISTS "installation_installer_candidate_runs_installation_order_id_created_a_idx" ON "installation_installer_candidate_runs"("installation_order_id", "created_at");
CREATE INDEX IF NOT EXISTS "installation_installer_candidate_run_results_candidate_run_id_rank_idx" ON "installation_installer_candidate_run_results"("candidate_run_id", "rank");
CREATE INDEX IF NOT EXISTS "installation_installer_candidate_run_results_installer_id_idx" ON "installation_installer_candidate_run_results"("installer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_notifications_idempotency_key_key" ON "installation_notifications"("idempotency_key");
CREATE INDEX IF NOT EXISTS "installation_notifications_status_created_at_idx" ON "installation_notifications"("status", "created_at");
CREATE INDEX IF NOT EXISTS "installation_order_status_events_installation_order_id_crea_idx" ON "installation_order_status_events"("installation_order_id", "created_at");
CREATE INDEX IF NOT EXISTS "installation_order_status_events_event_type_created_at_idx" ON "installation_order_status_events"("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "installation_issues_status_created_at_idx" ON "installation_issues"("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "installation_issues_id_installation_order_id_key" ON "installation_issues"("id", "installation_order_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'satisfaction_surveys_registration_id_fkey') THEN
    ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "warranty_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_source_id_fkey') THEN
    ALTER TABLE "installation_orders" ADD CONSTRAINT "installation_orders_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "installation_order_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_active_customer_request_id_fkey') THEN
    ALTER TABLE "installation_orders" ADD CONSTRAINT "installation_orders_active_customer_request_id_fkey" FOREIGN KEY ("active_customer_request_id") REFERENCES "installation_customer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_active_assignment_id_fkey') THEN
    ALTER TABLE "installation_orders" ADD CONSTRAINT "installation_orders_active_assignment_id_fkey" FOREIGN KEY ("active_assignment_id") REFERENCES "installation_installer_assignment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_current_installer_id_fkey') THEN
    ALTER TABLE "installation_orders" ADD CONSTRAINT "installation_orders_current_installer_id_fkey" FOREIGN KEY ("current_installer_id") REFERENCES "installers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_last_issue_id_fkey') THEN
    ALTER TABLE "installation_orders" ADD CONSTRAINT "installation_orders_last_issue_id_fkey" FOREIGN KEY ("last_issue_id") REFERENCES "installation_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_customer_requests_installation_order_id_fkey') THEN
    ALTER TABLE "installation_customer_requests" ADD CONSTRAINT "installation_customer_requests_installation_order_id_fkey" FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_assignment_attempts_installation_order_id_fkey') THEN
    ALTER TABLE "installation_installer_assignment_attempts" ADD CONSTRAINT "installation_installer_assignment_attempts_installation_order_id_fkey" FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_assignment_attempts_customer_request_id_fkey') THEN
    ALTER TABLE "installation_installer_assignment_attempts" ADD CONSTRAINT "installation_installer_assignment_attempts_customer_request_id_fkey" FOREIGN KEY ("customer_request_id") REFERENCES "installation_customer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_assignment_attempts_installer_id_fkey') THEN
    ALTER TABLE "installation_installer_assignment_attempts" ADD CONSTRAINT "installation_installer_assignment_attempts_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_candidate_runs_installation_order_id_fkey') THEN
    ALTER TABLE "installation_installer_candidate_runs" ADD CONSTRAINT "installation_installer_candidate_runs_installation_order_id_fkey" FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_candidate_runs_customer_request_id_fkey') THEN
    ALTER TABLE "installation_installer_candidate_runs" ADD CONSTRAINT "installation_installer_candidate_runs_customer_request_id_fkey" FOREIGN KEY ("customer_request_id") REFERENCES "installation_customer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_candidate_run_results_candidate_run_id_fkey') THEN
    ALTER TABLE "installation_installer_candidate_run_results" ADD CONSTRAINT "installation_installer_candidate_run_results_candidate_run_id_fkey" FOREIGN KEY ("candidate_run_id") REFERENCES "installation_installer_candidate_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_installer_candidate_run_results_installer_id_fkey') THEN
    ALTER TABLE "installation_installer_candidate_run_results" ADD CONSTRAINT "installation_installer_candidate_run_results_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_notifications_installation_order_id_fkey') THEN
    ALTER TABLE "installation_notifications" ADD CONSTRAINT "installation_notifications_installation_order_id_fkey" FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_notifications_customer_request_id_fkey') THEN
    ALTER TABLE "installation_notifications" ADD CONSTRAINT "installation_notifications_customer_request_id_fkey" FOREIGN KEY ("customer_request_id") REFERENCES "installation_customer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_notifications_installation_assignment_id_fkey') THEN
    ALTER TABLE "installation_notifications" ADD CONSTRAINT "installation_notifications_installation_assignment_id_fkey" FOREIGN KEY ("installation_assignment_id") REFERENCES "installation_installer_assignment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_order_status_events_installation_order_id_fkey') THEN
    ALTER TABLE "installation_order_status_events" ADD CONSTRAINT "installation_order_status_events_installation_order_id_fkey" FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_issues_installation_order_id_fkey') THEN
    ALTER TABLE "installation_issues" ADD CONSTRAINT "installation_issues_installation_order_id_fkey" FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Preserve historical issue rows while enforcing at most one open issue per type.
CREATE UNIQUE INDEX IF NOT EXISTS "installation_issues_one_open_per_type_idx"
  ON "installation_issues" ("installation_order_id", "type")
  WHERE "status" = 'OPEN';

-- Composite active pointer constraints prevent cross-order active row references.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_active_customer_request_same_order_fkey') THEN
    ALTER TABLE "installation_orders"
      ADD CONSTRAINT "installation_orders_active_customer_request_same_order_fkey"
      FOREIGN KEY ("active_customer_request_id", "id") REFERENCES "installation_customer_requests"("id", "installation_order_id")
      ON UPDATE CASCADE
      ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_active_assignment_same_order_fkey') THEN
    ALTER TABLE "installation_orders"
      ADD CONSTRAINT "installation_orders_active_assignment_same_order_fkey"
      FOREIGN KEY ("active_assignment_id", "id") REFERENCES "installation_installer_assignment_attempts"("id", "installation_order_id")
      ON UPDATE CASCADE
      ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installation_orders_last_issue_same_order_fkey') THEN
    ALTER TABLE "installation_orders"
      ADD CONSTRAINT "installation_orders_last_issue_same_order_fkey"
      FOREIGN KEY ("last_issue_id", "id") REFERENCES "installation_issues"("id", "installation_order_id")
      ON UPDATE CASCADE
      ON DELETE NO ACTION;
  END IF;
END $$;
