-- 팝빌 전자세금계산서(정발행): 기사 팝빌 연동 상태 + 정산서별 발행 기록.
-- 추가만 한다(기존 데이터 변경 없음).
CREATE TABLE IF NOT EXISTS "installer_popbill_links" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installer_id" TEXT NOT NULL,
  "corp_num" TEXT NOT NULL,
  "user_id" TEXT,
  "status" TEXT NOT NULL,
  "cert_expires_at" TIMESTAMPTZ(6),
  "checked_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installer_popbill_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "installer_popbill_links_installer_id_key" ON "installer_popbill_links"("installer_id");
CREATE INDEX IF NOT EXISTS "installer_popbill_links_status_idx" ON "installer_popbill_links"("status");
DO $$ BEGIN
  ALTER TABLE "installer_popbill_links" ADD CONSTRAINT "installer_popbill_links_installer_id_fkey"
    FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 앱은 Prisma(서버)로만 접근한다. anon 키로 직접 읽히지 않게 막는다.
ALTER TABLE IF EXISTS "installer_popbill_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "popbill_mgt_key" TEXT;
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "popbill_corp_num" TEXT;
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "nts_confirm_num" TEXT;
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "popbill_issued_at" TIMESTAMPTZ(6);
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "popbill_error" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_statements_popbill_mgt_key_key" ON "settlement_statements"("popbill_mgt_key");
