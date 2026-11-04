-- RF447 월패드 호환 DB + 완료 등록의 월패드 연동 결과.
-- Additive only. 코드 배포 "전"에 Supabase SQL Editor 에서 실행한다 (새 코드는 이 칼럼·테이블을 읽고 쓴다).
-- 재실행해도 안전하다.

-- 1) 완료 등록: 월패드 연동 결과·제조사·모델·실패 사유·메모. 기존 행은 비어 있다(옛 제출).
ALTER TABLE "installation_completions"
  ADD COLUMN IF NOT EXISTS "wallpad_result" TEXT,
  ADD COLUMN IF NOT EXISTS "wallpad_brand" TEXT,
  ADD COLUMN IF NOT EXISTS "wallpad_model" TEXT,
  ADD COLUMN IF NOT EXISTS "wallpad_fail_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "wallpad_note" TEXT;

-- 2) 월패드 모델
CREATE TABLE IF NOT EXISTS "wallpad_models" (
  "id"                  TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "brand"               TEXT NOT NULL,
  "model"               TEXT NOT NULL,
  "model_key"           TEXT NOT NULL,
  "aliases"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "verdict"             TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "note"                TEXT,
  "source_type"         TEXT,
  "source_url"          TEXT,
  "verified_on"         TEXT,
  "updated_by_admin_id" TEXT,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "wallpad_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallpad_models_model_key_key" ON "wallpad_models" ("model_key");
CREATE INDEX IF NOT EXISTS "wallpad_models_brand_idx" ON "wallpad_models" ("brand");

-- 3) 단지별 현장 사례
CREATE TABLE IF NOT EXISTS "wallpad_site_cases" (
  "id"                    TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "site_name"             TEXT NOT NULL,
  "site_key"              TEXT,
  "site_address"          TEXT,
  "brand"                 TEXT,
  "model"                 TEXT,
  "result"                TEXT NOT NULL,
  "fail_reason"           TEXT,
  "note"                  TEXT,
  "source"                TEXT NOT NULL,
  "source_url"            TEXT,
  "installation_order_id" TEXT,
  "created_by_admin_id"   TEXT,
  "occurred_on"           TEXT,
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "wallpad_site_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallpad_site_cases_installation_order_id_key" ON "wallpad_site_cases" ("installation_order_id");
CREATE INDEX IF NOT EXISTS "wallpad_site_cases_site_key_idx" ON "wallpad_site_cases" ("site_key");

-- 4) 제조사·시공사 의견
CREATE TABLE IF NOT EXISTS "wallpad_compat_notes" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "kind"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "keywords"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "note"        TEXT NOT NULL,
  "source_type" TEXT,
  "reported_on" TEXT,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "wallpad_compat_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE IF EXISTS "wallpad_models"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "wallpad_site_cases"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "wallpad_compat_notes" ENABLE ROW LEVEL SECURITY;
