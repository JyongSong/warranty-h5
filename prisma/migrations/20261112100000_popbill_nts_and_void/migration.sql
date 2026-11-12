-- 팝빌 앱 발행 세금계산서: 국세청 전송 결과 + 본사 취소 이력. 추가만 한다.
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "nts_send_state" TEXT;
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "nts_send_error" TEXT;
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "nts_sent_at" TIMESTAMPTZ(6);
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "nts_checked_at" TIMESTAMPTZ(6);
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "popbill_history" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "settlement_statements_nts_send_state_idx" ON "settlement_statements"("nts_send_state");
