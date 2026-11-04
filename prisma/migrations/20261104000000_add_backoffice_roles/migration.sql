-- 백오피스 등급(1 최고 관리자 / 2 관리자 / 3 사용자, 0 승인 대기), 회원가입, 변경 이력.
-- Additive only. 코드 배포 "전"에 Supabase SQL Editor 에서 실행한다
-- (새 코드는 로그인할 때부터 name 칼럼을 읽는다). 재실행해도 안전하다.

ALTER TABLE "backoffice_users"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_encrypted" TEXT;

CREATE TABLE IF NOT EXISTS "backoffice_audit_logs" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "actor_id" TEXT,
  "actor_label" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "entity_label" TEXT,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backoffice_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "backoffice_audit_logs_created_at_idx"
  ON "backoffice_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "backoffice_audit_logs_entity_type_entity_id_idx"
  ON "backoffice_audit_logs" ("entity_type", "entity_id");

-- 앱은 Prisma(서버)로만 접근한다. anon 키로 직접 읽히지 않게 막는다.
ALTER TABLE IF EXISTS "backoffice_audit_logs" ENABLE ROW LEVEL SECURITY;
