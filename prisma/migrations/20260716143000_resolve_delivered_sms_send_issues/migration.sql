-- A notification can be reclassified as delivered after an earlier send-stage
-- issue was created. Close every SMS issue whose linked notification now has a
-- terminal SOLAPI 4000 delivery result, regardless of the recorded failure stage.
UPDATE "installation_issues" AS issue
SET
  "status" = 'RESOLVED',
  "resolved_at" = CURRENT_TIMESTAMP,
  "resolution_note" = 'SOLAPI 수신완료 코드(4000) 확인에 따라 SMS 예외 종결',
  "updated_at" = CURRENT_TIMESTAMP
WHERE issue."status" = 'OPEN'
  AND issue."type" IN (
    'CUSTOMER_INPUT_LINK_SMS_SEND_FAILED',
    'INSTALLER_ASSIGNMENT_SMS_SEND_FAILED',
    'CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED'
  )
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
