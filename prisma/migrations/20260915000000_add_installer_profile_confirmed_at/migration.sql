-- 기사가 본인 정보를 직접 확인·제출한 시각.
-- 총판이 모아 준 명단에는 주소·연동 능력·A/S 긴급출동이 비어 있어, 기사에게
-- 링크를 보내 직접 채우게 한다. 이 값이 비어 있으면 아직 응답하지 않은 사람이므로
-- 재발송 대상을 고르는 기준이 된다.
ALTER TABLE "installers"
  ADD COLUMN IF NOT EXISTS "profile_confirmed_at" TIMESTAMPTZ(6);
