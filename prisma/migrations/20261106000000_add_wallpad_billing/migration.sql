-- 월패드 연동 결제 방식(본사 청구 / 현장 결제) + 본사 청구 정산 금액.
-- 둘 다 추가만 한다(기존 행은 NULL / 0 → 지금처럼 현장 결제로 본다).
ALTER TABLE "installation_completions" ADD COLUMN IF NOT EXISTS "wallpad_billing" TEXT;
ALTER TABLE "settlement_lines" ADD COLUMN IF NOT EXISTS "wallpad_fee" INTEGER NOT NULL DEFAULT 0;
