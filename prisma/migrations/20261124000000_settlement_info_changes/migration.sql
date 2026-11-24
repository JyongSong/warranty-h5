-- 기사 정산 정보 변경 이력(증빙 종류 변경). 추가만 한다.
CREATE TABLE IF NOT EXISTS "installer_settlement_info_changes" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installer_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "from_value" TEXT,
  "to_value" TEXT,
  "source" TEXT NOT NULL,
  "changed_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installer_settlement_info_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "installer_settlement_info_changes_installer_id_created_at_idx"
  ON "installer_settlement_info_changes"("installer_id", "created_at");
DO $$ BEGIN
  ALTER TABLE "installer_settlement_info_changes" ADD CONSTRAINT "installer_settlement_info_changes_installer_id_fkey"
    FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 앱은 Prisma(서버)로만 접근한다. anon 키로 직접 읽히지 않게 막는다.
ALTER TABLE IF EXISTS "installer_settlement_info_changes" ENABLE ROW LEVEL SECURITY;
