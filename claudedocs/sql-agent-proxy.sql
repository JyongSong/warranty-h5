-- 총판 대행 배정 — 운영 DB 에 넣을 컬럼 5개 + 총판 계정 표시 (기존 데이터는 바꾸지 않음)
-- Supabase SQL Editor 에서 한 번에 실행. IF NOT EXISTS 라 다시 실행해도 안전.
-- ⚠ 코드 배포(merge) 전에 먼저 실행해야 한다. 컬럼이 없으면 기사 앱·설치 상세 화면이 오류가 난다.

ALTER TABLE "installers" ADD COLUMN IF NOT EXISTS "is_agent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "installation_orders" ADD COLUMN IF NOT EXISTS "agent_proxy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "installation_orders" ADD COLUMN IF NOT EXISTS "agent_proxy_assigned_at" TIMESTAMPTZ(6);
ALTER TABLE "installation_completions" ADD COLUMN IF NOT EXISTS "agent_proxy_base_fee" INTEGER;
ALTER TABLE "installation_completions" ADD COLUMN IF NOT EXISTS "actual_installer" TEXT;

-- 총판 계정 표시: 김경민 (010-4265-9955, 경영하드웨어).
-- 전화번호(하이픈 무시) + 이름이 정확히 1명일 때만 바꾼다. 아니면 0행.
-- 마지막 결과만 보이므로 이 결과가 1행(김경민)이면 위 컬럼 추가까지 모두 끝난 것이다.
WITH target AS (
  SELECT id FROM "installers"
  WHERE regexp_replace(phone, '\D', '', 'g') = '01042659955' AND name = '김경민'
), guard AS (
  SELECT count(*) = 1 AS ok FROM target
)
UPDATE "installers" SET is_agent = true
WHERE id IN (SELECT id FROM target) AND (SELECT ok FROM guard)
RETURNING id, name, phone, branch, active, is_agent;
