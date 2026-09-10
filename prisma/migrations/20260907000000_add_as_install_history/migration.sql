-- A/S "누가 깔았나" 추적용 ERP(ECOUNT) 과거 설치 이력 사본.
-- Additive only — safe to run on production.
-- Run in Supabase SQL editor (prod DB is managed by hand; do NOT prisma db push).
--
-- installation_orders(운영 상태머신)에 섞지 않는 이유: ERP 이력은 배정/완료
-- 흐름을 거치지 않은 읽기 전용 사본이라, 같은 테이블에 넣으면 대시보드 집계·
-- 정산 추출·배정 후보 통계가 전부 오염된다.

CREATE TABLE IF NOT EXISTS "as_install_history" (
  "id"                       TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  -- ERP 전표번호("26/09/04 -7"). 재업로드 시 upsert 키.
  "erp_doc_no"               TEXT NOT NULL,
  "install_date"             TEXT,
  "customer_name_encrypted"  TEXT,
  "customer_name_hash"       TEXT,
  "customer_phone_encrypted" TEXT,
  "customer_phone_hash"      TEXT,
  -- MOBILE(01X) | SAFE(050X 안심번호) | OTHER
  "phone_kind"               TEXT NOT NULL DEFAULT 'OTHER',
  "address_encrypted"        TEXT,
  "address_hash"             TEXT,
  "item_name"                TEXT,
  "vendor_name"              TEXT,
  "installer_name_raw"       TEXT,
  -- 담당기사가 1명으로 확정될 때만. 업체만 아는 건은 NULL 로 둔다.
  "matched_installer_id"     TEXT,
  -- 거래처명이 붙은 installers.branch. 업체 단위 조회가 여기로 걸린다.
  "matched_branch"           TEXT,
  -- INSTALLER_NAME | VENDOR_NAME | NONE
  "matched_by"               TEXT NOT NULL DEFAULT 'NONE',
  "service_fee"              INTEGER,
  "erp_status"               TEXT,
  "memo"                     TEXT,
  "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "as_install_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "as_install_history_erp_doc_no_key"
  ON "as_install_history" ("erp_doc_no");
CREATE INDEX IF NOT EXISTS "as_install_history_customer_phone_hash_idx"
  ON "as_install_history" ("customer_phone_hash");
CREATE INDEX IF NOT EXISTS "as_install_history_customer_name_hash_idx"
  ON "as_install_history" ("customer_name_hash");
CREATE INDEX IF NOT EXISTS "as_install_history_address_hash_idx"
  ON "as_install_history" ("address_hash");
CREATE INDEX IF NOT EXISTS "as_install_history_matched_installer_id_idx"
  ON "as_install_history" ("matched_installer_id");
CREATE INDEX IF NOT EXISTS "as_install_history_matched_branch_idx"
  ON "as_install_history" ("matched_branch");

-- 기사가 삭제돼도 이력 자체는 남긴다(업체명 원문은 그대로 쓸모가 있다).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'as_install_history_matched_installer_id_fkey'
  ) THEN
    ALTER TABLE "as_install_history"
      ADD CONSTRAINT "as_install_history_matched_installer_id_fkey"
      FOREIGN KEY ("matched_installer_id") REFERENCES "installers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 고객 개인정보가 들어가는 테이블이므로 기존 방침대로 서버 전용으로 잠근다.
ALTER TABLE IF EXISTS "as_install_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "as_install_history" FROM anon, authenticated;
