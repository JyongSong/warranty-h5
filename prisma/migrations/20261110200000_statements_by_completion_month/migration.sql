-- 월 정산서를 설치 완료 월 기준으로: 같은 달 추가 정산서(seq) 허용 + 라인 ↔ 정산서 연결.
-- settlement_statements 는 아직 비어 있다(공개 전). 추가·인덱스 교체만 한다.
ALTER TABLE "settlement_statements" ADD COLUMN IF NOT EXISTS "seq" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "settlement_statements_ym_installer_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_statements_ym_installer_id_seq_key"
  ON "settlement_statements"("ym", "installer_id", "seq");

ALTER TABLE "settlement_lines" ADD COLUMN IF NOT EXISTS "statement_id" TEXT;
CREATE INDEX IF NOT EXISTS "settlement_lines_statement_id_idx" ON "settlement_lines"("statement_id");
DO $$ BEGIN
  ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_statement_id_fkey"
    FOREIGN KEY ("statement_id") REFERENCES "settlement_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
