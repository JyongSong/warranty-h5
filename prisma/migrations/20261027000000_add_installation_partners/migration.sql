-- 외부 협력사 PL ENG(피엘이앤지, 코드 PL) 배정.
-- 자사 도어락팀 밖의 용역 품목(조명·커튼·도어벨 등)이 든 주문은 고객 입력 후 협력사에 통째로 넘긴다.
-- 협력사는 접수 때 본사에 청구할 시공비(partner_claim_amount)를 입력한다.
-- 협력사 관리자는 기존 partner_accounts(partner_code = 'PL') 로 /partner 에 로그인한다.

CREATE TABLE IF NOT EXISTS "installation_partners" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notify_phone" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installation_partners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "installation_partners_code_key" ON "installation_partners"("code");

ALTER TABLE "installation_orders"
  ADD COLUMN IF NOT EXISTS "partner_id" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_assigned_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "partner_status" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_status_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "partner_routing" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_claim_amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "partner_installer" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_completed_at" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "installation_orders_partner_id_partner_status_idx"
  ON "installation_orders"("partner_id", "partner_status");
DO $$ BEGIN
  ALTER TABLE "installation_orders"
    ADD CONSTRAINT "installation_orders_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "installation_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "installation_partner_notes" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "installation_order_id" TEXT NOT NULL,
  "partner_id" TEXT,
  "author_user_id" TEXT,
  "author_type" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "partner_status" TEXT,
  "body" TEXT,
  "photo_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installation_partner_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "installation_partner_notes_installation_order_id_created_at_idx"
  ON "installation_partner_notes"("installation_order_id", "created_at");
DO $$ BEGIN
  ALTER TABLE "installation_partner_notes"
    ADD CONSTRAINT "installation_partner_notes_installation_order_id_fkey"
    FOREIGN KEY ("installation_order_id") REFERENCES "installation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PL ENG(피엘이앤지). 코드 'PL' 은 내부 키, 화면에는 name 이 보인다. notify_phone 은 새 배정 알림 문자를 받을 PL 관리자 번호로 바꿔 넣는다.
INSERT INTO "installation_partners" ("code", "name", "notify_phone")
VALUES ('PL', 'PL ENG', NULL)
ON CONFLICT ("code") DO NOTHING;
