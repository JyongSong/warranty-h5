-- 기사 배정 알림을 앱 푸시로 먼저 보내고, 일정 시간 무응답일 때만 문자로
-- 폴백하기 위한 컬럼. 푸시를 보낸 시각을 기록해 두고 outbox 가 이 시각을
-- 기준으로 폴백 문자 발송 여부를 판단한다.
ALTER TABLE "installation_notifications"
  ADD COLUMN IF NOT EXISTS "push_sent_at" TIMESTAMP(3);
