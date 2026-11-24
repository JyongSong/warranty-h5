-- 기사 앱 공지(받은 공지함). 추가만 한다.
CREATE TABLE IF NOT EXISTS "installer_inbox_notices" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installer_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "read_at" TIMESTAMPTZ(6),
  CONSTRAINT "installer_inbox_notices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "installer_inbox_notices_installer_id_read_at_idx"
  ON "installer_inbox_notices"("installer_id", "read_at");
DO $$ BEGIN
  ALTER TABLE "installer_inbox_notices" ADD CONSTRAINT "installer_inbox_notices_installer_id_fkey"
    FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 앱은 Prisma(서버)로만 접근한다. anon 키로 직접 읽히지 않게 막는다.
ALTER TABLE IF EXISTS "installer_inbox_notices" ENABLE ROW LEVEL SECURITY;
