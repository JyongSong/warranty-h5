-- 월 정산서 (기사 1명 × 1개월 1장). 새 테이블만 만든다(추가 전용).
CREATE TABLE IF NOT EXISTS "settlement_statements" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "ym" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "installer_id" TEXT NOT NULL,
  "line_count" INTEGER NOT NULL,
  "base_amount" INTEGER NOT NULL,
  "tax_doc_type" TEXT,
  "vat_amount" INTEGER,
  "pay_amount" INTEGER,
  "evidence_status" TEXT NOT NULL DEFAULT 'PENDING',
  "evidence_photo_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "invoice_issue_date" TEXT,
  "cash_receipt_no" TEXT,
  "cash_receipt_date" TEXT,
  "evidence_submitted_at" TIMESTAMPTZ(6),
  "evidence_reviewed_at" TIMESTAMPTZ(6),
  "evidence_reviewed_by" TEXT,
  "evidence_reject_reason" TEXT,
  "paid_at" TIMESTAMPTZ(6),
  "paid_by_admin_id" TEXT,
  "issued_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "settlement_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_statements_period_id_fkey" FOREIGN KEY ("period_id")
    REFERENCES "settlement_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "settlement_statements_installer_id_fkey" FOREIGN KEY ("installer_id")
    REFERENCES "installers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_statements_ym_installer_id_key"
  ON "settlement_statements"("ym", "installer_id");
CREATE INDEX IF NOT EXISTS "settlement_statements_installer_id_idx" ON "settlement_statements"("installer_id");
CREATE INDEX IF NOT EXISTS "settlement_statements_period_id_idx" ON "settlement_statements"("period_id");
