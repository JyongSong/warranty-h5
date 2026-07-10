ALTER TABLE "installation_notifications"
  ADD COLUMN IF NOT EXISTS "provider_status" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_status_code" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_reported_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider_checked_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "installation_notifications_status_provider_checked_at_idx"
  ON "installation_notifications"("status", "provider_checked_at");
