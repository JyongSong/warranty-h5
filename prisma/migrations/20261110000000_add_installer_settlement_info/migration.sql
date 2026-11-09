-- 기사 정산 정보(증빙 종류 + 사업자·계좌 + 사진). 새 테이블만 만든다(추가 전용).
CREATE TABLE IF NOT EXISTS "installer_settlement_infos" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installer_id" TEXT NOT NULL,
  "tax_doc_type" TEXT,
  "business_number" TEXT NOT NULL,
  "business_name" TEXT NOT NULL,
  "representative_name" TEXT NOT NULL,
  "invoice_email" TEXT,
  "bank_name" TEXT NOT NULL,
  "account_number_encrypted" TEXT NOT NULL,
  "account_holder" TEXT NOT NULL,
  "business_license_photo_path" TEXT NOT NULL,
  "bankbook_photo_path" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "reject_reason" TEXT,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "reviewed_at" TIMESTAMPTZ(6),
  "reviewed_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installer_settlement_infos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "installer_settlement_infos_installer_id_fkey" FOREIGN KEY ("installer_id")
    REFERENCES "installers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "installer_settlement_infos_installer_id_key"
  ON "installer_settlement_infos"("installer_id");
CREATE INDEX IF NOT EXISTS "installer_settlement_infos_status_idx"
  ON "installer_settlement_infos"("status");
