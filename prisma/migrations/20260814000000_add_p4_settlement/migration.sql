-- P4 정산 (installer settlement). Additive only — safe to run on production.
-- Run in Supabase SQL editor (prod DB is managed by hand; do NOT prisma db push).

-- 1) Installer-declared long-distance fee, frozen into the snapshot at approval.
ALTER TABLE "installation_completions"
  ADD COLUMN IF NOT EXISTS "long_distance_amount" INTEGER;

-- 2) Per-installer rate overrides (NULL column = fall back to global default).
CREATE TABLE IF NOT EXISTS "installer_rates" (
  "id"                TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installer_id"      TEXT NOT NULL,
  "linkage_app_fee"   INTEGER,
  "linkage_hub_fee"   INTEGER,
  "travel_fee"        INTEGER,
  "night_surcharge"   INTEGER,
  "weekend_surcharge" INTEGER,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installer_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "installer_rates_installer_id_key" ON "installer_rates" ("installer_id");
ALTER TABLE "installer_rates"
  DROP CONSTRAINT IF EXISTS "installer_rates_installer_id_fkey";
ALTER TABLE "installer_rates"
  ADD CONSTRAINT "installer_rates_installer_id_fkey"
  FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Settlement periods (custom range; status OPEN=待결산 / SETTLED=已결산).
CREATE TABLE IF NOT EXISTS "settlement_periods" (
  "id"                 TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "name"               TEXT NOT NULL,
  "start_date"         DATE NOT NULL,
  "end_date"           DATE NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'OPEN',
  "settled_at"         TIMESTAMPTZ(6),
  "settled_by_admin_id" TEXT,
  "created_by_admin_id" TEXT,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "settlement_periods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "settlement_periods_status_idx" ON "settlement_periods" ("status");

-- 4) Frozen settlement snapshot lines (§8.5 M1). One per approved INSTALL/AS.
CREATE TABLE IF NOT EXISTS "settlement_lines" (
  "id"                  TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installer_id"        TEXT NOT NULL,
  "source_type"         TEXT NOT NULL,
  "source_order_id"     TEXT NOT NULL,
  "completed_at"        TIMESTAMPTZ(6) NOT NULL,
  "approved_by_admin_id" TEXT,
  "linkage_fee"         INTEGER NOT NULL DEFAULT 0,
  "travel_fee"          INTEGER NOT NULL DEFAULT 0,
  "long_distance_fee"   INTEGER NOT NULL DEFAULT 0,
  "night_weekend_fee"   INTEGER NOT NULL DEFAULT 0,
  "service_fee"         INTEGER NOT NULL DEFAULT 0,
  "wallpad_amount"      INTEGER NOT NULL DEFAULT 0,
  "total_amount"        INTEGER NOT NULL DEFAULT 0,
  "rate_source"         JSONB,
  "breakdown"           JSONB,
  "period_id"           TEXT,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_lines_source_type_source_order_id_key"
  ON "settlement_lines" ("source_type", "source_order_id");
CREATE INDEX IF NOT EXISTS "settlement_lines_installer_id_idx" ON "settlement_lines" ("installer_id");
CREATE INDEX IF NOT EXISTS "settlement_lines_period_id_idx" ON "settlement_lines" ("period_id");
CREATE INDEX IF NOT EXISTS "settlement_lines_completed_at_idx" ON "settlement_lines" ("completed_at");
ALTER TABLE "settlement_lines"
  DROP CONSTRAINT IF EXISTS "settlement_lines_installer_id_fkey";
ALTER TABLE "settlement_lines"
  ADD CONSTRAINT "settlement_lines_installer_id_fkey"
  FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_lines"
  DROP CONSTRAINT IF EXISTS "settlement_lines_period_id_fkey";
ALTER TABLE "settlement_lines"
  ADD CONSTRAINT "settlement_lines_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "settlement_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
