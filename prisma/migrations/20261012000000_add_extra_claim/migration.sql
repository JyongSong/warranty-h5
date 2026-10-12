-- 기타 청구 금액.
-- 완료 등록 때 기사가 이 주문과 관련해 본사에 따로 청구할 금액을 적는다.
-- 금액을 적으면 사유는 필수, 증빙 사진은 선택이다. 본사가 승인할 때 금액을 확정하고,
-- 확정된 금액은 settlement_lines.extra_claim_fee 로 얼어붙어 정산 합계에 들어간다.
ALTER TABLE "installation_completions"
  ADD COLUMN IF NOT EXISTS "extra_claim_amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "extra_claim_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "extra_claim_photo_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "settlement_lines"
  ADD COLUMN IF NOT EXISTS "extra_claim_fee" INTEGER NOT NULL DEFAULT 0;
