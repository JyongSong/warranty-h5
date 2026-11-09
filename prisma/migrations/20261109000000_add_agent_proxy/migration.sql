-- 총판 대행 배정: 총판 계정 표시 + 주문 대행 표시 + 대행 완료의 기본 출장비·실제 시공자.
-- 모두 추가만 한다(기존 행은 false / NULL → 지금과 똑같이 일반 건).
ALTER TABLE "installers" ADD COLUMN IF NOT EXISTS "is_agent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "installation_orders" ADD COLUMN IF NOT EXISTS "agent_proxy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "installation_orders" ADD COLUMN IF NOT EXISTS "agent_proxy_assigned_at" TIMESTAMPTZ(6);
ALTER TABLE "installation_completions" ADD COLUMN IF NOT EXISTS "agent_proxy_base_fee" INTEGER;
ALTER TABLE "installation_completions" ADD COLUMN IF NOT EXISTS "actual_installer" TEXT;
