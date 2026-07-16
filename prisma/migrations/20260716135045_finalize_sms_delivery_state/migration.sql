-- Keep applied migrations immutable: add the terminal delivery outcome in a
-- follow-up migration, then repair rows created or reclassified after the
-- earlier one-time repair ran.
ALTER TYPE "InstallationNotificationStatus"
  ADD VALUE IF NOT EXISTS 'DELIVERED' AFTER 'SENT';

UPDATE "installation_notifications"
SET
  "status" = 'DELIVERED',
  "delivery_check_count" = 0,
  "error_code" = NULL,
  "error_message" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "provider_status_code" = '4000'
  AND UPPER(COALESCE("provider_status", '')) NOT LIKE '%FAIL%'
  AND UPPER(COALESCE("provider_status", '')) NOT LIKE '%ERROR%'
  AND "error_code" = 'SMS_DELIVERY_FAILED';

UPDATE "installation_issues" AS issue
SET
  "status" = 'RESOLVED',
  "resolved_at" = CURRENT_TIMESTAMP,
  "resolution_note" = 'SOLAPI 발송완료 코드(4000) 오분류 정정',
  "updated_at" = CURRENT_TIMESTAMP
WHERE issue."status" = 'OPEN'
  AND issue."metadata"->>'failureStage' = 'DELIVERY'
  AND EXISTS (
    SELECT 1
    FROM "installation_notifications" AS notification
    WHERE notification."id" = issue."metadata"->>'notificationId'
      AND notification."status" = 'DELIVERED'
      AND notification."provider_status_code" = '4000'
      AND UPPER(COALESCE(notification."provider_status", '')) NOT LIKE '%FAIL%'
      AND UPPER(COALESCE(notification."provider_status", '')) NOT LIKE '%ERROR%'
  );

UPDATE "installation_orders" AS installation_order
SET
  "has_open_issue" = EXISTS (
    SELECT 1
    FROM "installation_issues" AS issue
    WHERE issue."installation_order_id" = installation_order."id"
      AND issue."status" = 'OPEN'
  ),
  "updated_at" = CURRENT_TIMESTAMP;
