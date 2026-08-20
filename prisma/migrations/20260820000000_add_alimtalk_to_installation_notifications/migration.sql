-- 알림톡 발송에 필요한 템플릿 키와 변수를 알림 행에 함께 보관한다.
-- outbox 는 생성 시점이 아니라 발송 시점에 동작하므로, 렌더된 본문만으로는
-- 알림톡을 만들 수 없다. 본문(sms_body)은 대체발송용으로 그대로 둔다.
ALTER TABLE "installation_notifications"
  ADD COLUMN IF NOT EXISTS "alimtalk_template_key" TEXT,
  ADD COLUMN IF NOT EXISTS "alimtalk_variables" JSONB;
