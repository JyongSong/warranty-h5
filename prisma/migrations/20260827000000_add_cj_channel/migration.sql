-- CJ 채널 (외부 판매 채널 고객 입력). Additive only — safe to run on production.
-- Run in Supabase SQL editor (prod DB is managed by hand; do NOT prisma db push).

-- 1) 주문 소스에 채널 구분과 외부 주문번호를 단다.
--    자사 ERP 동기화 건은 전부 'SELF' 로 남는다.
ALTER TABLE "installation_order_sources"
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'SELF',
  ADD COLUMN IF NOT EXISTS "external_order_no" TEXT,
  ADD COLUMN IF NOT EXISTS "external_order_date" TEXT;
CREATE INDEX IF NOT EXISTS "installation_order_sources_channel_idx"
  ON "installation_order_sources" ("channel");

-- 2) 주문자 번호. 기존 customer_phone_* 은 그대로 "설치 받는 분" 번호를 뜻하고,
--    기사가 실제로 거는 번호도 계속 그쪽이다. 여기는 인증을 통과한 예비 연락처.
ALTER TABLE "installation_customer_requests"
  ADD COLUMN IF NOT EXISTS "orderer_phone_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "orderer_phone_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "orderer_phone_verified_at" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "installation_customer_requests_orderer_phone_hash_idx"
  ON "installation_customer_requests" ("orderer_phone_hash");

-- 3) CJ 가 직접 올리는 주문번호 명단. 여기에 있어야 제출할 수 있고,
--    consumed_at 이 차면 두 번째 제출은 막힌다.
CREATE TABLE IF NOT EXISTS "cj_order_manifests" (
  "id"                    TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "order_no"              TEXT NOT NULL,
  "order_date"            TEXT,
  "upload_batch_id"       TEXT,
  "consumed_at"           TIMESTAMPTZ(6),
  "installation_order_id" TEXT,
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cj_order_manifests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cj_order_manifests_order_no_key"
  ON "cj_order_manifests" ("order_no");
CREATE INDEX IF NOT EXISTS "cj_order_manifests_consumed_at_idx"
  ON "cj_order_manifests" ("consumed_at");
CREATE INDEX IF NOT EXISTS "cj_order_manifests_upload_batch_id_idx"
  ON "cj_order_manifests" ("upload_batch_id");

-- 4) 업로드 이력.
CREATE TABLE IF NOT EXISTS "cj_manifest_uploads" (
  "id"              TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "file_name"       TEXT NOT NULL,
  "total_rows"      INTEGER NOT NULL DEFAULT 0,
  "inserted_count"  INTEGER NOT NULL DEFAULT 0,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  "invalid_count"   INTEGER NOT NULL DEFAULT 0,
  "uploaded_by"     TEXT,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cj_manifest_uploads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cj_manifest_uploads_created_at_idx"
  ON "cj_manifest_uploads" ("created_at");

-- 5) 고객용 OTP. installer_auth_otps 와 같은 구조에, 제출 시 서버가 인증
--    통과를 확인할 수 있도록 verified_token 을 더했다. 공개 페이지라 이게
--    없으면 프런트를 건너뛴 직접 POST 로 인증을 우회할 수 있다.
CREATE TABLE IF NOT EXISTS "customer_auth_otps" (
  "id"             TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "phone_hash"     TEXT NOT NULL,
  "code_hash"      TEXT NOT NULL,
  "expires_at"     TIMESTAMPTZ(6) NOT NULL,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "consumed_at"    TIMESTAMPTZ(6),
  "verified_at"    TIMESTAMPTZ(6),
  "verified_token" TEXT,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "customer_auth_otps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_auth_otps_verified_token_key"
  ON "customer_auth_otps" ("verified_token");
CREATE INDEX IF NOT EXISTS "customer_auth_otps_phone_hash_created_at_idx"
  ON "customer_auth_otps" ("phone_hash", "created_at");

-- 6) CJ 담당자 계정. admins 와 분리해 둔다 — 같은 테이블에 두면 백오피스
--    페이지 한 곳만 레벨 검사를 빠뜨려도 고객 개인정보가 샌다.
CREATE TABLE IF NOT EXISTS "partner_accounts" (
  "id"            TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "login_id"      TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "partner_code"  TEXT NOT NULL DEFAULT 'CJ',
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "partner_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_accounts_login_id_key"
  ON "partner_accounts" ("login_id");

-- 7) 새 테이블도 기존 방침대로 서버 전용으로 잠근다(default-deny + Data API 차단).
ALTER TABLE IF EXISTS "cj_order_manifests"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "cj_manifest_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "customer_auth_otps"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "partner_accounts"    ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "cj_order_manifests",
  "cj_manifest_uploads",
  "customer_auth_otps",
  "partner_accounts"
FROM anon, authenticated;
